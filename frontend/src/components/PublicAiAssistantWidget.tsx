import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Avatar,
  Box,
  CircularProgress,
  Fab,
  IconButton,
  Link,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import CloseIcon from '@mui/icons-material/Close';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import SendIcon from '@mui/icons-material/Send';
import ReactMarkdown from 'react-markdown';
import apiClient from '../apiClient';
import AiContentLabel from './AiContentLabel';

const MAX_QUESTION_LENGTH = 500;
const MAX_SOURCE_LABEL_LENGTH = 48;

type Source = { title: string; url: string };
type Message = { role: 'user' | 'assistant'; content: string; sources?: Source[] };

const compactSourceLabel = (value: string) => {
  const clean = String(value || '').replace(/\s+/g, ' ').trim();
  return clean.length > MAX_SOURCE_LABEL_LENGTH
    ? `${clean.slice(0, MAX_SOURCE_LABEL_LENGTH - 1).trimEnd()}…`
    : clean;
};

type AssistantConfig = {
  siteKey: string;
  partnerName: string;
  partnerSlug?: string;
  partnerLogo?: string;
  partnerWebsite?: string;
  assistantName: string;
  welcomeMessage: string;
  avatarUrl?: string;
  primaryColor: string;
  secondaryColor: string;
  ready: boolean;
};

interface Props {
  siteKey: string;
  initialOpen?: boolean;
  embedded?: boolean;
  primaryColor?: string;
  partnerName?: string;
}

const makeSessionId = () => {
  try { return crypto.randomUUID(); } catch (_error) {
    const bytes = new Uint8Array(16);
    if (window.crypto?.getRandomValues) window.crypto.getRandomValues(bytes);
    else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
};

const PublicAiAssistantWidget: React.FC<Props> = ({
  siteKey,
  initialOpen = false,
  embedded = false,
  primaryColor: primaryColorHint,
  partnerName: partnerNameHint,
}) => {
  const [open, setOpen] = useState(initialOpen || embedded);
  const [config, setConfig] = useState<AssistantConfig | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [configLoading, setConfigLoading] = useState(true);
  const [error, setError] = useState('');
  const sessionId = useMemo(makeSessionId, []);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let active = true;
    setConfigLoading(true);
    apiClient.get(`/api/public/assistant/${encodeURIComponent(siteKey)}/config`)
      .then((response) => {
        if (!active) return;
        setConfig(response.data);
        setMessages([{ role: 'assistant', content: response.data.welcomeMessage }]);
        if (embedded && window.parent !== window) {
          window.parent.postMessage({
            type: 'mobiliti-assistant-ready',
            primaryColor: response.data.primaryColor,
          }, '*');
        }
      })
      .catch(() => {
        if (!active) return;
        setError('Der digitale Assistent ist derzeit nicht verfügbar.');
        if (embedded && window.parent !== window) {
          window.parent.postMessage({ type: 'mobiliti-assistant-unavailable' }, '*');
        }
      })
      .finally(() => active && setConfigLoading(false));
    return () => { active = false; };
  }, [embedded, siteKey]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const primaryColor = config?.primaryColor || primaryColorHint || '#e30613';
  const partnerName = config?.partnerName || partnerNameHint || 'Organisation';
  const avatarUrl = config?.avatarUrl || config?.partnerLogo;

  const close = () => {
    if (embedded && window.parent !== window) {
      window.parent.postMessage({ type: 'mobiliti-assistant-close' }, '*');
      return;
    }
    setOpen(false);
  };

  const resetConversation = () => {
    if (loading) return;
    setMessages(config ? [{ role: 'assistant', content: config.welcomeMessage }] : []);
    setInput('');
    setError('');
  };

  const send = async () => {
    const question = input.replace(/\s+/g, ' ').trim();
    if (question.length < 3 || question.length > 500 || loading || !config?.ready) return;
    const nextMessages: Message[] = [...messages, { role: 'user', content: question }];
    setMessages(nextMessages);
    setInput('');
    setError('');
    setLoading(true);
    try {
      const history = messages.slice(-8).map(({ role, content }) => ({ role, content }));
      const response = await apiClient.post(`/api/public/assistant/${encodeURIComponent(siteKey)}/ask`, {
        question,
        history,
        sessionId,
      });
      setMessages((current) => [...current, {
        role: 'assistant',
        content: response.data.answer,
        sources: Array.isArray(response.data.sources) ? response.data.sources : [],
      }]);
    } catch (requestError: any) {
      setError(requestError?.response?.data?.message || 'Die Frage konnte gerade nicht beantwortet werden.');
    } finally {
      setLoading(false);
    }
  };

  const panel = (
    <Paper
      role="dialog"
      aria-label={`Digitaler Assistent von ${partnerName}`}
      elevation={embedded ? 0 : 16}
      sx={{
        position: embedded ? 'relative' : 'fixed',
        right: embedded ? 'auto' : { xs: 12, sm: 24 },
        bottom: embedded ? 'auto' : { xs: 12, sm: 88 },
        width: embedded ? '100%' : { xs: 'calc(100% - 24px)', sm: 390 },
        height: embedded ? '100dvh' : { xs: 'min(70dvh, 590px)', sm: 570 },
        maxHeight: embedded ? '100dvh' : { xs: 'calc(100dvh - 110px)', sm: 570 },
        zIndex: 1700,
        borderRadius: embedded ? 0 : 3,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
        border: embedded ? 0 : `5px solid ${primaryColor}`,
        bgcolor: '#fff',
      }}
    >
      <Box sx={{ p: 2, bgcolor: primaryColor, color: '#fff', display: 'flex', alignItems: 'center', gap: 1.25 }}>
        <Avatar
          src={avatarUrl || undefined}
          alt={config?.assistantName || 'Digitaler Branchenassistent'}
          sx={{ width: 52, height: 52, bgcolor: '#fff', color: primaryColor, flexShrink: 0, '& img': { objectFit: 'cover', objectPosition: 'center top' } }}
        >
          <AutoAwesomeIcon />
        </Avatar>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography fontWeight={900} noWrap>{config?.assistantName || 'Digitaler Branchenassistent'}</Typography>
          <Stack direction="row" spacing={0.75} alignItems="center">
            <Typography variant="caption" noWrap>{partnerName}</Typography>
            <AiContentLabel kind="ai" size={12} />
          </Stack>
        </Box>
        <Stack direction="row" spacing={0.5}>
          <Tooltip title="Unterhaltung löschen und neu starten" arrow>
            <span>
              <IconButton
                onClick={resetConversation}
                disabled={messages.length <= 1 || loading}
                aria-label="Unterhaltung löschen und neu starten"
                sx={{ color: '#fff', bgcolor: 'rgba(255,255,255,.14)', '&.Mui-disabled': { color: 'rgba(255,255,255,.45)' } }}
              >
                <RestartAltIcon />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Chatfenster schließen" arrow>
            <IconButton onClick={close} aria-label="Chatfenster schließen" sx={{ color: '#fff', bgcolor: 'rgba(255,255,255,.14)' }}>
              <CloseIcon />
            </IconButton>
          </Tooltip>
        </Stack>
      </Box>

      <Box sx={{ flex: 1, overflowY: 'auto', p: 1.5, bgcolor: '#f6f8fb' }}>
        {configLoading && <Box sx={{ height: '100%', display: 'grid', placeItems: 'center' }}><CircularProgress size={28} /></Box>}
        {!configLoading && messages.map((message, index) => (
          <Box key={`${message.role}-${index}`} sx={{ display: 'flex', justifyContent: message.role === 'user' ? 'flex-end' : 'flex-start', mb: 1.25 }}>
            <Paper sx={{ p: 1.25, maxWidth: '88%', bgcolor: message.role === 'user' ? primaryColor : '#fff', color: message.role === 'user' ? '#fff' : 'text.primary', borderRadius: 2.5 }}>
              <Box sx={{ '& p': { m: 0 }, '& ul, & ol': { my: 0.5, pl: 2.5 }, overflowWrap: 'anywhere' }}>
                <ReactMarkdown
                  components={{
                    a: ({ href, children }) => (
                      <Link href={href} target="_blank" rel="noopener noreferrer" underline="hover" sx={{ color: primaryColor, fontWeight: 800 }}>
                        {children}<OpenInNewIcon sx={{ ml: 0.35, fontSize: 12, verticalAlign: 'middle' }} />
                      </Link>
                    ),
                  }}
                >
                  {message.content}
                </ReactMarkdown>
              </Box>
              {!!message.sources?.length && (
                <Box sx={{ mt: 1, pt: 1, borderTop: '1px solid', borderColor: 'divider', minWidth: 0 }}>
                  <Typography variant="caption" fontWeight={800} sx={{ display: 'block', mb: 0.4 }}>Quellen:</Typography>
                  <Stack spacing={0.35} alignItems="flex-start">
                    {message.sources.map((source, sourceIndex) => (
                      <Link
                        key={`${source.url}-${sourceIndex}`}
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        variant="caption"
                        underline="hover"
                        title={source.title}
                        sx={{ display: 'inline-flex', gap: 0.4, alignItems: 'center', color: primaryColor, maxWidth: '100%', minWidth: 0 }}
                      >
                        <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {compactSourceLabel(source.title)}
                        </Box>
                        <OpenInNewIcon sx={{ fontSize: 13, flexShrink: 0 }} />
                      </Link>
                    ))}
                  </Stack>
                </Box>
              )}
            </Paper>
          </Box>
        ))}
        {loading && <Box sx={{ display: 'flex', justifyContent: 'flex-start', p: 1 }}><CircularProgress size={20} /></Box>}
        {error && <Alert severity="info" sx={{ mt: 1 }}>{error}</Alert>}
        {!configLoading && config && !config.ready && <Alert severity="info">Die Website-Quellen werden noch vorbereitet.</Alert>}
        <div ref={bottomRef} />
      </Box>

      <Box sx={{ p: 1.25, borderTop: '1px solid', borderColor: 'divider', bgcolor: '#fff' }}>
        <Stack direction="row" spacing={1} alignItems="flex-start">
          <TextField
            value={input}
            onChange={(event) => setInput(event.target.value.slice(0, MAX_QUESTION_LENGTH))}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(); }
            }}
            placeholder="Frage zur Website stellen …"
            size="small"
            fullWidth
            multiline
            maxRows={3}
            disabled={!config?.ready || loading}
            helperText={`${input.length}/${MAX_QUESTION_LENGTH}`}
            inputProps={{ maxLength: MAX_QUESTION_LENGTH, 'aria-label': 'Frage an den digitalen Assistenten' }}
            FormHelperTextProps={{ sx: { textAlign: 'right', mr: 0, mt: 0.25, lineHeight: 1 } }}
          />
          <IconButton onClick={() => void send()} disabled={input.trim().length < 3 || loading || !config?.ready} aria-label="Frage senden" sx={{ width: 40, height: 40, p: 0, flexShrink: 0, bgcolor: primaryColor, color: '#fff', '&:hover': { bgcolor: primaryColor, filter: 'brightness(.92)' }, '&.Mui-disabled': { bgcolor: 'action.disabledBackground' } }}>
            <SendIcon />
          </IconButton>
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
          KI-Antworten können Fehler enthalten. Grundlage sind freigegebene Inhalte der Website.
        </Typography>
      </Box>
    </Paper>
  );

  if (embedded) return panel;
  return (
    <>
      {!open && (
        <Tooltip title={`Fragen an ${partnerName}`}>
          <Fab onClick={() => setOpen(true)} aria-label="Digitalen Assistenten öffnen" sx={{ position: 'fixed', right: { xs: 18, sm: 24 }, bottom: { xs: 82, sm: 24 }, zIndex: 1600, width: { xs: 66, sm: 74 }, height: { xs: 66, sm: 74 }, bgcolor: primaryColor, color: '#fff', overflow: 'hidden', p: 0.4, boxShadow: 8, '&:hover': { bgcolor: primaryColor, filter: 'brightness(.92)' } }}>
            <Avatar
              src={avatarUrl || undefined}
              alt="Digitaler Assistent"
              sx={{ width: '100%', height: '100%', bgcolor: '#fff', color: primaryColor, '& img': { objectFit: 'cover', objectPosition: 'center top' } }}
            >
              <AutoAwesomeIcon />
            </Avatar>
          </Fab>
        </Tooltip>
      )}
      {open && panel}
    </>
  );
};

export default PublicAiAssistantWidget;
