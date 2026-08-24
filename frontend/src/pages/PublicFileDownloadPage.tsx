import React, { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import {
  Alert,
  alpha,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Container,
  Divider,
  Stack,
  Typography,
} from '@mui/material';
import CloudDownloadIcon from '@mui/icons-material/CloudDownload';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DescriptionIcon from '@mui/icons-material/Description';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import IosShareIcon from '@mui/icons-material/IosShare';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import apiClient from '../apiClient';
import { resolveAssetUrl } from '../utils/assetUrl';

interface PublicFileInfo {
  file: {
    id: string;
    filename: string;
    fileType: string | null;
    fileSize: number;
    description: string | null;
    expiresAt: string | null;
    maxDownloads: number | null;
    downloadCount: number;
  };
  partner: {
    id: string;
    name: string;
    slug: string | null;
    logoUrl: string | null;
    primaryColor: string | null;
  };
}

const DEFAULT_LOGO = '/logos/default-company.svg';

const formatFileSize = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return 'Dateigröße unbekannt';
  const units = ['Bytes', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / (1024 ** index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
};

const PublicFileDownloadPage: React.FC = () => {
  const { fileId = '', token = '' } = useParams<{ fileId: string; token: string }>();
  const [data, setData] = useState<PublicFileInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await apiClient.get<PublicFileInfo>(
          `/api/public/files/${encodeURIComponent(fileId)}/${encodeURIComponent(token)}`
        );
        if (!response.res.ok || !response.data) {
          throw new Error((response.data as any)?.message || 'Dieser Download-Link ist nicht verfügbar.');
        }
        if (active) setData(response.data);
      } catch (loadError: any) {
        if (active) setError(loadError?.message || 'Dieser Download-Link ist nicht verfügbar.');
      } finally {
        if (active) setLoading(false);
      }
    };

    if (fileId && token) void load();
    else {
      setError('Dieser Download-Link ist ungültig.');
      setLoading(false);
    }
    return () => { active = false; };
  }, [fileId, token]);

  useEffect(() => {
    const previousTitle = document.title;
    const robots = document.querySelector('meta[name="robots"]') as HTMLMetaElement | null;
    const previousRobots = robots?.content;
    const robotsMeta = robots || document.createElement('meta');
    if (!robots) {
      robotsMeta.name = 'robots';
      document.head.appendChild(robotsMeta);
    }
    robotsMeta.content = 'noindex, nofollow, noarchive';
    document.title = data?.file.filename ? `${data.file.filename} – sicherer Download` : 'Sicherer Download';

    return () => {
      document.title = previousTitle;
      if (!robots) robotsMeta.remove();
      else robotsMeta.content = previousRobots || '';
    };
  }, [data?.file.filename]);

  const shareUrl = typeof window !== 'undefined' ? window.location.href : '';
  const downloadUrl = useMemo(
    () => `/api/public/files/${encodeURIComponent(fileId)}/${encodeURIComponent(token)}/download`,
    [fileId, token]
  );

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      window.prompt('Download-Link kopieren:', shareUrl);
    }
  };

  const shareLink = async () => {
    if (navigator.share && data) {
      try {
        await navigator.share({
          title: data.file.filename,
          text: `${data.partner.name} stellt Ihnen eine Datei zum Download bereit.`,
          url: shareUrl,
        });
        return;
      } catch (shareError: any) {
        if (shareError?.name === 'AbortError') return;
      }
    }
    await copyLink();
  };

  if (loading) {
    return <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}><CircularProgress /></Box>;
  }

  const primaryColor = data?.partner.primaryColor || '#e31b23';
  const partnerPath = data?.partner.slug ? `/${encodeURIComponent(data.partner.slug)}` : '/';
  const logoUrl = data?.partner.logoUrl ? resolveAssetUrl(data.partner.logoUrl) : DEFAULT_LOGO;
  const remainingDownloads = data?.file.maxDownloads
    ? Math.max(0, data.file.maxDownloads - data.file.downloadCount)
    : null;

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', bgcolor: '#f5f7fa' }}>
      <Box sx={{ height: 8, bgcolor: primaryColor }} />
      <Container maxWidth="sm" sx={{ flex: 1, display: 'flex', alignItems: 'center', py: { xs: 4, sm: 7 } }}>
        <Card sx={{ width: '100%', borderRadius: 4, overflow: 'hidden', boxShadow: '0 24px 70px rgba(15,23,42,.14)', border: '1px solid rgba(15,23,42,.08)' }}>
          <Box sx={{ px: { xs: 2.5, sm: 4 }, py: 2.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, bgcolor: '#fff' }}>
            <Box component={RouterLink} to={partnerPath} sx={{ display: 'inline-flex', alignItems: 'center', gap: 1.5, color: 'inherit', textDecoration: 'none', minWidth: 0 }}>
              <Box
                component="img"
                src={logoUrl}
                alt={data?.partner.name || 'Unternehmenslogo'}
                onError={(event: React.SyntheticEvent<HTMLImageElement>) => {
                  if (!event.currentTarget.src.endsWith(DEFAULT_LOGO)) event.currentTarget.src = DEFAULT_LOGO;
                }}
                sx={{ width: 48, height: 48, objectFit: 'contain', borderRadius: 1.5, bgcolor: '#fff' }}
              />
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="subtitle1" fontWeight={900} noWrap>{data?.partner.name || 'Mobiliti'}</Typography>
                <Typography variant="caption" color="text.secondary">Sicherer Dokumentdownload</Typography>
              </Box>
            </Box>
            <LockOutlinedIcon sx={{ color: primaryColor }} />
          </Box>

          <Divider />
          <CardContent sx={{ p: { xs: 2.5, sm: 4 } }}>
            {error || !data ? (
              <Stack spacing={2.5} alignItems="center" textAlign="center" sx={{ py: 3 }}>
                <Alert severity="warning" sx={{ width: '100%' }}>{error || 'Dieser Download-Link ist nicht verfügbar.'}</Alert>
                <Button component={RouterLink} to="/" variant="outlined">Zur öffentlichen Startseite</Button>
              </Stack>
            ) : (
              <Stack spacing={3}>
                <Box sx={{ width: 72, height: 72, borderRadius: 3, display: 'grid', placeItems: 'center', bgcolor: alpha(primaryColor, 0.1), color: primaryColor }}>
                  {data.file.fileType?.includes('pdf') ? <DescriptionIcon sx={{ fontSize: 38 }} /> : <InsertDriveFileIcon sx={{ fontSize: 38 }} />}
                </Box>

                <Box>
                  <Typography variant="h5" component="h1" fontWeight={950} sx={{ overflowWrap: 'anywhere' }}>{data.file.filename}</Typography>
                  {data.file.description && <Typography color="text.secondary" sx={{ mt: 1, whiteSpace: 'pre-wrap' }}>{data.file.description}</Typography>}
                </Box>

                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                  <Chip label={formatFileSize(data.file.fileSize)} size="small" variant="outlined" />
                  {data.file.expiresAt && <Chip label={`Gültig bis ${new Date(data.file.expiresAt).toLocaleDateString('de-DE')}`} size="small" variant="outlined" />}
                  {remainingDownloads !== null && <Chip label={`${remainingDownloads} Downloads verfügbar`} size="small" variant="outlined" />}
                </Stack>

                <Button
                  component="a"
                  href={downloadUrl}
                  referrerPolicy="no-referrer"
                  variant="contained"
                  size="large"
                  startIcon={<CloudDownloadIcon />}
                  sx={{ bgcolor: primaryColor, py: 1.5, borderRadius: 2.5, textTransform: 'none', fontWeight: 900, '&:hover': { bgcolor: primaryColor, filter: 'brightness(.92)' } }}
                >
                  Datei herunterladen
                </Button>

                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                  <Button fullWidth variant="outlined" startIcon={<ContentCopyIcon />} onClick={copyLink} sx={{ textTransform: 'none', fontWeight: 800 }}>
                    {copied ? 'Link kopiert' : 'Link kopieren'}
                  </Button>
                  <Button fullWidth variant="outlined" startIcon={<IosShareIcon />} onClick={shareLink} sx={{ textTransform: 'none', fontWeight: 800 }}>
                    Link teilen
                  </Button>
                </Stack>

                <Alert severity="info" icon={<LockOutlinedIcon fontSize="inherit" />}>
                  Dieser Link ist nicht öffentlich gelistet. Bitte geben Sie ihn nur an vorgesehene Empfänger weiter.
                </Alert>
              </Stack>
            )}
          </CardContent>
        </Card>
      </Container>
      <Typography variant="caption" color="text.secondary" textAlign="center" sx={{ pb: 2.5, px: 2 }}>
        Bereitgestellt über Mobiliti · Sicherer, zeitlich begrenzbarer Dateizugriff
      </Typography>
    </Box>
  );
};

export default PublicFileDownloadPage;
