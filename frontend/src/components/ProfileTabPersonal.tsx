// frontend/src/components/ProfileTabPersonal.tsx
import React, { useState, useRef, useEffect } from 'react';
import { Box, Grid, TextField, Button, Avatar, Badge, IconButton, Tooltip, CircularProgress, Snackbar, Dialog, DialogTitle, DialogContent, DialogActions, Typography, Paper, FormControlLabel, Switch, Divider, Stack, Alert, Chip } from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import QrCodeIcon from '@mui/icons-material/QrCode';
import ShareIcon from '@mui/icons-material/Share';
import SaveIcon from '@mui/icons-material/Save';
import EmailIcon from '@mui/icons-material/Email';
import PhoneIcon from '@mui/icons-material/Phone';
import LinkedInIcon from '@mui/icons-material/LinkedIn';
import { QRCodeCanvas } from 'qrcode.react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import apiClient from '../apiClient';
import posthog from 'posthog-js';

const ProfileTabPersonal: React.FC<{ user: any; isDemoUser: boolean }> = ({ user, isDemoUser }) => {
  const { t } = useTranslation();
  const { updateUser } = useAuth();
  
  const [firstName, setFirstName] = useState(user.first_name || '');
  const [lastName, setLastName] = useState(user.last_name || '');
  const [organizationName, setOrganizationName] = useState(user.organization_name || '');
  const [linkedinUrl, setLinkedinUrl] = useState(user.linkedin_url || '');
  const [phone, setPhone] = useState(user.phone || '');
  const [publicProfileEnabled, setPublicProfileEnabled] = useState(Boolean(user.public_profile_enabled));
  const [showEmailPublicly, setShowEmailPublicly] = useState(Boolean(user.show_email_publicly));
  const [showPhonePublicly, setShowPhonePublicly] = useState(Boolean(user.show_phone_publicly));
  const [showOrganizationPublicly, setShowOrganizationPublicly] = useState(Boolean(user.show_organization_publicly));
  const [showLinkedinPublicly, setShowLinkedinPublicly] = useState(Boolean(user.show_linkedin_publicly));
  
  const [avatarLoading, setAvatarLoading] = useState(false);
  const avatarUploadRef = useRef<HTMLInputElement>(null);
  const [qrDialogOpen, setQrDialogOpen] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '' });

  useEffect(() => {
    setFirstName(user.first_name || '');
    setLastName(user.last_name || '');
    setOrganizationName(user.organization_name || '');
    setLinkedinUrl(user.linkedin_url || '');
    setPhone(user.phone || '');
    setPublicProfileEnabled(Boolean(user.public_profile_enabled));
    setShowEmailPublicly(Boolean(user.show_email_publicly));
    setShowPhonePublicly(Boolean(user.show_phone_publicly));
    setShowOrganizationPublicly(Boolean(user.show_organization_publicly));
    setShowLinkedinPublicly(Boolean(user.show_linkedin_publicly));
  }, [user]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isDemoUser) return;
    try {
      const response = await apiClient.put('/api/users/me', {
        first_name: firstName,
        last_name: lastName,
        organization_name: organizationName,
        linkedin_url: linkedinUrl,
        phone: phone,
        public_profile_enabled: publicProfileEnabled,
        show_email_publicly: showEmailPublicly,
        show_phone_publicly: showPhonePublicly,
        show_organization_publicly: showOrganizationPublicly,
        show_linkedin_publicly: showLinkedinPublicly,
      });
      if (!response.res.ok || !response.data?.id) {
        throw new Error(response.data?.message || 'Profildaten konnten nicht gespeichert werden.');
      }
      updateUser(response.data);
      setSnackbar({ open: true, message: 'Persönliche Daten erfolgreich gespeichert.' });
      posthog.capture('profile_updated');
    } catch (err) {
      setSnackbar({ open: true, message: 'Fehler beim Speichern der Daten.' });
    }
  };

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (isDemoUser) return;
    const file = event.target.files?.[0];
    if (!file) return;

    setAvatarLoading(true);
    const formData = new FormData();
    formData.append('avatar', file);

    try {
      const response = await apiClient.post('/api/users/me/avatar', formData);
      updateUser(response.data.user);
      setSnackbar({ open: true, message: 'Profilbild aktualisiert.' });
    } catch (err) {
      setSnackbar({ open: true, message: 'Fehler beim Hochladen.' });
    } finally {
      setAvatarLoading(false);
    }
  };

  const handleAvatarDelete = async () => {
    if (isDemoUser || !window.confirm("Profilbild wirklich entfernen?")) return;
    setAvatarLoading(true);
    try {
      const response = await apiClient.delete('/api/users/me/avatar');
      updateUser(response.data.user);
      setSnackbar({ open: true, message: 'Profilbild gelöscht.' });
    } catch (err) {
      setSnackbar({ open: true, message: 'Fehler beim Löschen.' });
    } finally {
      setAvatarLoading(false);
    }
  };

  const previewName = [firstName, lastName].filter(Boolean).join(' ').trim() || user.username || 'Mein Profil';
  const renderBusinessCardPreview = (compact = false) => (
    <Paper
      elevation={0}
      sx={{
        width: '100%',
        maxWidth: compact ? 430 : 520,
        mx: 'auto',
        overflow: 'hidden',
        borderRadius: 3,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
      }}
    >
      <Box sx={{ height: compact ? 54 : 72, bgcolor: 'primary.main' }} />
      <Stack alignItems="center" spacing={1.25} sx={{ px: 2.5, pb: 2.5, mt: compact ? -3.5 : -4.5, textAlign: 'center' }}>
        <Avatar src={user.profile_image_url || undefined} sx={{ width: compact ? 70 : 88, height: compact ? 70 : 88, border: '4px solid white', bgcolor: 'background.paper', color: 'primary.main', fontWeight: 900 }}>
          {previewName.slice(0, 1).toUpperCase()}
        </Avatar>
        <Box>
          <Typography variant={compact ? 'h6' : 'h5'} fontWeight={900}>{previewName}</Typography>
          {showOrganizationPublicly && organizationName.trim() && <Typography color="text.secondary">{organizationName.trim()}</Typography>}
        </Box>
        {(showEmailPublicly || showPhonePublicly || showLinkedinPublicly) && (
          <Stack spacing={0.75} alignItems="center" sx={{ width: '100%' }}>
            {showEmailPublicly && user.email && <Stack direction="row" spacing={0.75} alignItems="center"><EmailIcon color="primary" fontSize="small" /><Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>{user.email}</Typography></Stack>}
            {showPhonePublicly && phone.trim() && <Stack direction="row" spacing={0.75} alignItems="center"><PhoneIcon color="primary" fontSize="small" /><Typography variant="body2">{phone.trim()}</Typography></Stack>}
            {showLinkedinPublicly && linkedinUrl.trim() && <Stack direction="row" spacing={0.75} alignItems="center"><LinkedInIcon sx={{ color: '#0077b5' }} fontSize="small" /><Typography variant="body2" noWrap sx={{ maxWidth: 320 }}>{linkedinUrl.trim()}</Typography></Stack>}
          </Stack>
        )}
        {!showEmailPublicly && !showPhonePublicly && !showLinkedinPublicly && !showOrganizationPublicly && (
          <Typography variant="caption" color="text.secondary">Aktuell werden keine zusätzlichen Kontaktdaten veröffentlicht.</Typography>
        )}
      </Stack>
    </Paper>
  );

  return (
    <Box component="form" onSubmit={handleSave}>
      <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, borderRadius: 3 }}>
      <Typography variant="h6" fontWeight={800}>Persönliche Angaben</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>Profilbild, Kontaktdaten und Organisation für Ihr internes Profil.</Typography>
      <Box sx={{ display: 'flex', justifyContent: 'center', mb: 4, alignItems: 'center', flexDirection: 'column' }}>
        <input type="file" ref={avatarUploadRef} onChange={handleAvatarUpload} hidden accept="image/png, image/jpeg, image/webp" />
        <Tooltip title={isDemoUser ? '' : 'Bild ändern'}>
          <Badge
            overlap="circular"
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            badgeContent={
              <IconButton onClick={() => avatarUploadRef.current?.click()} disabled={isDemoUser || avatarLoading} size="small" sx={{ bgcolor: 'background.paper', border: '1px solid #ccc' }}>
                {avatarLoading ? <CircularProgress size={20} /> : <EditIcon fontSize="small" />}
              </IconButton>
            }
          >
            <Avatar src={user.profile_image_url} sx={{ width: 100, height: 100, fontSize: '3rem' }}>
              {user.first_name ? user.first_name.charAt(0) : user.username.charAt(0)}
            </Avatar>
          </Badge>
        </Tooltip>
        
        {user.profile_image_url && (
          <Button color="error" size="small" onClick={handleAvatarDelete} disabled={avatarLoading || isDemoUser} sx={{ mt: 1 }}>Bild entfernen</Button>
        )}
        
        <Button
          variant="outlined"
          startIcon={<QrCodeIcon />}
          onClick={() => setQrDialogOpen(true)}
          disabled={isDemoUser}
          sx={{ mt: 2 }}
        >
          Digitale Visitenkarte
        </Button>
      </Box>

      <Grid container spacing={3}>
        <Grid item xs={12} sm={6}><TextField label={t('profile.firstname')} fullWidth value={firstName} onChange={(e) => setFirstName(e.target.value)} disabled={isDemoUser} /></Grid>
        <Grid item xs={12} sm={6}><TextField label={t('profile.lastname')} fullWidth value={lastName} onChange={(e) => setLastName(e.target.value)} disabled={isDemoUser} /></Grid>
        <Grid item xs={12}><TextField label={t('profile.organization')} fullWidth value={organizationName} onChange={(e) => setOrganizationName(e.target.value)} disabled={isDemoUser} /></Grid>
        <Grid item xs={12} sm={6}><TextField label={t('profile.linkedinUrl')} fullWidth value={linkedinUrl} onChange={(e) => setLinkedinUrl(e.target.value)} disabled={isDemoUser} /></Grid>
        <Grid item xs={12} sm={6}><TextField label="Telefonnummer" fullWidth value={phone} onChange={(e) => setPhone(e.target.value)} disabled={isDemoUser} /></Grid>
      </Grid>
      </Paper>

      <Paper variant="outlined" sx={{ mt: 4, p: { xs: 2, sm: 3 }, borderRadius: 2 }}>
        <Typography variant="h6" gutterBottom>Öffentliche Visitenkarte</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Sie bestimmen selbst, ob Ihre Visitenkarte erreichbar ist und welche Kontaktdaten öffentlich ausgeliefert werden.
        </Typography>

        <FormControlLabel
          control={(
            <Switch
              checked={publicProfileEnabled}
              onChange={(event) => setPublicProfileEnabled(event.target.checked)}
              disabled={isDemoUser}
            />
          )}
          label="Öffentliche Visitenkarte aktivieren"
        />

        {!publicProfileEnabled && (
          <Alert severity="info" sx={{ mt: 1.5 }}>
            Das öffentliche Profil ist nicht erreichbar. Die interne Community bleibt davon unberührt.
          </Alert>
        )}

        <Divider sx={{ my: 2 }} />
        <Stack spacing={0.5}>
          <FormControlLabel
            control={<Switch checked={showOrganizationPublicly} onChange={(event) => setShowOrganizationPublicly(event.target.checked)} />}
            label="Organisation öffentlich anzeigen"
            disabled={isDemoUser || !publicProfileEnabled}
          />
          <FormControlLabel
            control={<Switch checked={showLinkedinPublicly} onChange={(event) => setShowLinkedinPublicly(event.target.checked)} />}
            label="LinkedIn öffentlich anzeigen"
            disabled={isDemoUser || !publicProfileEnabled || !linkedinUrl.trim()}
          />
          <FormControlLabel
            control={<Switch checked={showEmailPublicly} onChange={(event) => setShowEmailPublicly(event.target.checked)} />}
            label="E-Mail-Adresse öffentlich anzeigen"
            disabled={isDemoUser || !publicProfileEnabled || !user.email}
          />
          <FormControlLabel
            control={<Switch checked={showPhonePublicly} onChange={(event) => setShowPhonePublicly(event.target.checked)} />}
            label="Telefonnummer öffentlich anzeigen"
            disabled={isDemoUser || !publicProfileEnabled || !phone.trim()}
          />
        </Stack>

        <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1.5 }}>
          E-Mail und Telefonnummer sind standardmäßig nicht öffentlich. Änderungen werden erst mit „Persönliche Daten speichern“ wirksam.
        </Typography>

        <Box sx={{ mt: 3, p: { xs: 1.5, sm: 2 }, bgcolor: 'action.hover', borderRadius: 2 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
            <Typography fontWeight={800}>Darstellungs-Vorschau</Typography>
            <Chip size="small" label={publicProfileEnabled ? 'Öffentlich aktiv' : 'Nicht öffentlich'} color={publicProfileEnabled ? 'success' : 'default'} />
          </Stack>
          {renderBusinessCardPreview(true)}
        </Box>
      </Paper>

      <Box sx={{ mt: 4, display: 'flex', justifyContent: 'flex-end' }}>
        <Button type="submit" variant="contained" startIcon={<SaveIcon />} disabled={isDemoUser} size="large">
          Persönliche Daten speichern
        </Button>
      </Box>

      <Dialog open={qrDialogOpen} onClose={() => setQrDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ textAlign: 'center' }}>Digitale Visitenkarte</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 3 }}>
            {!publicProfileEnabled && <Alert severity="info" sx={{ mb: 2, width: '100%' }}>Diese Visitenkarte ist momentan nicht öffentlich erreichbar.</Alert>}
            <Box sx={{ p: 2, bgcolor: 'white', borderRadius: 2, border: '1px solid #eee', mb: 2 }}>
                <QRCodeCanvas value={`${window.location.origin}/p/${user.id}`} size={200} level="M" />
            </Box>
            <Typography variant="body2" align="center" color="text.secondary">Scannen Sie diesen Code, um Ihre Kontaktdaten zu teilen.</Typography>
            <Button startIcon={<ShareIcon />} sx={{ mt: 2 }} onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/p/${user.id}`); setSnackbar({ open: true, message: 'Link kopiert!' }); }}>Link kopieren</Button>
        </DialogContent>
        <DialogActions><Button onClick={() => setQrDialogOpen(false)}>Schließen</Button><Button component="a" href={`/p/${user.id}`} target="_blank" disabled={!user.public_profile_enabled}>Öffentlichen Link öffnen</Button></DialogActions>
      </Dialog>

      <Snackbar open={snackbar.open} autoHideDuration={3000} onClose={() => setSnackbar({ ...snackbar, open: false })} message={snackbar.message} />
    </Box>
  );
};

export default ProfileTabPersonal;
