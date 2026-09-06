import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  Grid,
  IconButton,
  Link,
  Paper,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import BusinessIcon from '@mui/icons-material/Business';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditIcon from '@mui/icons-material/Edit';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import LinkedInIcon from '@mui/icons-material/LinkedIn';
import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';
import TrackChangesIcon from '@mui/icons-material/TrackChanges';
import apiClient from '../apiClient';
import { resolveAssetUrl } from '../utils/assetUrl';

const DEFAULT_ACCOUNT_LOGO = '/logos/default-company.svg';

export interface AccountContactRecord {
  id: string;
  name: string;
  job_title?: string | null;
  email?: string | null;
  phone?: string | null;
  linkedin_url?: string | null;
  notes?: string | null;
  is_primary: boolean;
}

export interface AccountCompetitorRecord {
  id: string;
  name: string;
  website_url?: string | null;
  linkedin_url?: string | null;
  notes?: string | null;
}

export interface AccountDetailRecord {
  id: string;
  business_partner_id: string;
  name: string;
  website_url?: string | null;
  linkedin_url?: string | null;
  logo_url?: string | null;
  logo_source?: string | null;
  address?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  owner_user_id?: string | null;
  owner_user_name?: string | null;
  owner_user_email?: string | null;
  owner_profile_image_url?: string | null;
  status: 'prospect' | 'active_customer' | 'churned';
  notes?: string | null;
  competitor_count: number;
  contact_count: number;
  regions: Array<{ id: string; name: string }>;
  categories: Array<{ id: string; name: string }>;
  competitors: AccountCompetitorRecord[];
  contacts: AccountContactRecord[];
}

interface ContactForm {
  name: string;
  job_title: string;
  email: string;
  phone: string;
  linkedin_url: string;
  notes: string;
  is_primary: boolean;
}

interface AccountDetailDialogProps {
  open: boolean;
  accountId: string | null;
  onClose: () => void;
  onEdit?: (account: AccountDetailRecord) => void;
  onManageCompetitors?: (account: AccountDetailRecord) => void;
  onChanged?: () => void;
  showCompetitors?: boolean;
  readOnly?: boolean;
}

const emptyContact: ContactForm = {
  name: '',
  job_title: '',
  email: '',
  phone: '',
  linkedin_url: '',
  notes: '',
  is_primary: false,
};

const statusLabels: Record<AccountDetailRecord['status'], string> = {
  prospect: 'Interessent',
  active_customer: 'Kunde',
  churned: 'Ehemalig',
};

const safeWebUrl = (value?: string | null) => {
  try {
    const parsed = new URL(String(value || ''));
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : '';
  } catch {
    return '';
  }
};

const AccountDetailDialog: React.FC<AccountDetailDialogProps> = ({
  open,
  accountId,
  onClose,
  onEdit,
  onManageCompetitors,
  onChanged,
  showCompetitors = true,
  readOnly = false,
}) => {
  const [account, setAccount] = useState<AccountDetailRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contactOpen, setContactOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<AccountContactRecord | null>(null);
  const [contactForm, setContactForm] = useState<ContactForm>(emptyContact);
  const [contactSaving, setContactSaving] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);

  const loadAccount = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    setError(null);
    try {
      const endpoint = readOnly
        ? `/api/data/account-intelligence/accounts/${accountId}`
        : `/api/admin/accounts/${accountId}`;
      const { res, data } = await apiClient.get<AccountDetailRecord>(endpoint);
      if (!res.ok || !data) throw new Error((data as any)?.message || 'Account konnte nicht geladen werden.');
      setAccount(data);
    } catch (loadError: any) {
      setError(loadError?.message || 'Account konnte nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  }, [accountId, readOnly]);

  useEffect(() => {
    if (open) loadAccount();
    else setAccount(null);
  }, [loadAccount, open]);

  const logoUrl = resolveAssetUrl(account?.logo_url) || DEFAULT_ACCOUNT_LOGO;
  const websiteUrl = safeWebUrl(account?.website_url);
  const linkedInUrl = safeWebUrl(account?.linkedin_url);
  const competitors = useMemo(() => account?.competitors || [], [account?.competitors]);
  const contacts = useMemo(() => account?.contacts || [], [account?.contacts]);
  const qualityChecks = useMemo(() => account ? [
    { label: 'Website', complete: Boolean(websiteUrl) },
    { label: 'Logo', complete: Boolean(account.logo_url) },
    { label: 'Adresse', complete: Boolean(account.address) },
    { label: 'Zentraler Kontakt', complete: Boolean(account.contact_email || account.contact_phone) },
    { label: 'Verantwortung', complete: Boolean(account.owner_user_id) },
    { label: 'Ansprechpartner', complete: contacts.length > 0 },
    { label: 'Region', complete: (account.regions || []).length > 0 },
    { label: 'Branche', complete: (account.categories || []).length > 0 },
  ] : [], [account, contacts.length, websiteUrl]);
  const qualityScore = qualityChecks.length
    ? Math.round((qualityChecks.filter((item) => item.complete).length / qualityChecks.length) * 100)
    : 0;

  const openContactForm = (contact?: AccountContactRecord) => {
    setEditingContact(contact || null);
    setContactForm(contact ? {
      name: contact.name,
      job_title: contact.job_title || '',
      email: contact.email || '',
      phone: contact.phone || '',
      linkedin_url: contact.linkedin_url || '',
      notes: contact.notes || '',
      is_primary: Boolean(contact.is_primary),
    } : emptyContact);
    setContactError(null);
    setContactOpen(true);
  };

  const saveContact = async () => {
    if (!account || !contactForm.name.trim()) {
      setContactError('Bitte den Namen des Ansprechpartners eingeben.');
      return;
    }
    setContactSaving(true);
    setContactError(null);
    try {
      const response = editingContact
        ? await apiClient.put(`/api/admin/accounts/contacts/${editingContact.id}`, contactForm)
        : await apiClient.post(`/api/admin/accounts/${account.id}/contacts`, contactForm);
      if (!response.res.ok) throw new Error((response.data as any)?.message || 'Ansprechpartner konnte nicht gespeichert werden.');
      setContactOpen(false);
      await loadAccount();
      onChanged?.();
    } catch (saveError: any) {
      setContactError(saveError?.message || 'Ansprechpartner konnte nicht gespeichert werden.');
    } finally {
      setContactSaving(false);
    }
  };

  const deleteContact = async (contact: AccountContactRecord) => {
    if (!window.confirm(`Ansprechpartner „${contact.name}“ löschen?`)) return;
    try {
      const response = await apiClient.delete(`/api/admin/accounts/contacts/${contact.id}`);
      if (!response.res.ok) throw new Error((response.data as any)?.message || 'Ansprechpartner konnte nicht gelöscht werden.');
      await loadAccount();
      onChanged?.();
    } catch (deleteError: any) {
      setError(deleteError?.message || 'Ansprechpartner konnte nicht gelöscht werden.');
    }
  };

  return (
    <>
      <Dialog open={open} onClose={onClose} fullWidth maxWidth="lg" scroll="paper">
        <DialogTitle sx={{ pr: 7 }}>
          Account-Details
          <IconButton onClick={onClose} aria-label="Schließen" sx={{ position: 'absolute', right: 12, top: 10 }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers sx={{ p: { xs: 1.5, md: 3 } }}>
          {loading && <Box sx={{ minHeight: 260, display: 'grid', placeItems: 'center' }}><CircularProgress /></Box>}
          {error && <Alert severity="error">{error}</Alert>}
          {!loading && account && (
            <Stack spacing={2.5}>
              <Paper variant="outlined" sx={{ p: { xs: 2, md: 2.5 }, borderRadius: 3 }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ xs: 'flex-start', sm: 'center' }}>
                  <Avatar
                    variant="rounded"
                    src={logoUrl}
                    alt={`${account.name} Logo`}
                    imgProps={{ onError: (event) => { event.currentTarget.src = DEFAULT_ACCOUNT_LOGO; } }}
                    sx={{ width: 88, height: 72, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', '& img': { objectFit: 'contain', p: 0.75 } }}
                  >
                    <BusinessIcon />
                  </Avatar>
                  {account.logo_source && account.logo_source !== 'Account-Logo' && (
                    <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'block', sm: 'none' } }}>
                      Logo aus {account.logo_source}
                    </Typography>
                  )}
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center">
                      <Typography variant="h5" fontWeight={950}>{account.name}</Typography>
                      <Chip size="small" label={statusLabels[account.status] || account.status} color={account.status === 'active_customer' ? 'success' : 'default'} />
                    </Stack>
                    <Stack direction="row" spacing={1.5} useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
                      {websiteUrl && <Link href={websiteUrl} target="_blank" rel="noopener noreferrer" display="inline-flex" alignItems="center" gap={0.5}>{new URL(websiteUrl).hostname}<OpenInNewIcon fontSize="inherit" /></Link>}
                      {linkedInUrl && <Link href={linkedInUrl} target="_blank" rel="noopener noreferrer" display="inline-flex" alignItems="center" gap={0.5}><LinkedInIcon fontSize="small" />LinkedIn</Link>}
                    </Stack>
                    {account.logo_source && account.logo_source !== 'Account-Logo' && (
                      <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' }, mt: 0.7 }}>
                        Logo automatisch aus {account.logo_source}
                      </Typography>
                    )}
                  </Box>
                  <Stack direction="row" spacing={1}>
                    {onEdit && <Button variant="outlined" startIcon={<EditIcon />} onClick={() => onEdit(account)}>Bearbeiten</Button>}
                  </Stack>
                </Stack>
              </Paper>

              <Paper variant="outlined" sx={{ p: { xs: 2, md: 2.5 }, borderRadius: 3 }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2.5} alignItems={{ xs: 'stretch', sm: 'center' }}>
                  <Box sx={{ display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                    <Box
                      role="img"
                      aria-label={`Datenqualität ${qualityScore} Prozent`}
                      sx={{
                        width: 112,
                        height: 112,
                        borderRadius: '50%',
                        display: 'grid',
                        placeItems: 'center',
                        background: (theme) => `conic-gradient(${qualityScore >= 75 ? theme.palette.success.main : qualityScore >= 50 ? theme.palette.warning.main : theme.palette.error.main} 0 ${qualityScore}%, ${theme.palette.action.hover} ${qualityScore}% 100%)`,
                      }}
                    >
                      <Box sx={{ width: 82, height: 82, borderRadius: '50%', bgcolor: 'background.paper', display: 'grid', placeItems: 'center', textAlign: 'center' }}>
                        <Box>
                          <Typography variant="h5" sx={{ fontWeight: 950, lineHeight: 1 }}>{qualityScore}%</Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 800 }}>vollständig</Typography>
                        </Box>
                      </Box>
                    </Box>
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="h6" fontWeight={900}>Datenqualität dieses Accounts</Typography>
                    <Typography variant="body2" color="text.secondary">Acht Kernangaben für belastbare Zuordnung, Kontaktplanung und Reports.</Typography>
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' }, gap: 0.8, mt: 1.5 }}>
                      {qualityChecks.map((item) => (
                        <Box key={item.label} sx={{ p: 0.9, borderRadius: 2, bgcolor: item.complete ? 'success.light' : 'action.hover', color: item.complete ? 'success.contrastText' : 'text.secondary', minWidth: 0 }}>
                          <Typography variant="caption" sx={{ display: 'block', fontWeight: 850, overflowWrap: 'anywhere' }}>{item.complete ? '✓' : '○'} {item.label}</Typography>
                        </Box>
                      ))}
                    </Box>
                  </Box>
                </Stack>
              </Paper>

              <Grid container spacing={2}>
                <Grid item xs={12} md={5}>
                  <Paper variant="outlined" sx={{ p: 2.2, borderRadius: 3, height: '100%' }}>
                    <Typography variant="overline" color="text.secondary" fontWeight={900}>Unternehmensdaten</Typography>
                    <Stack spacing={1.4} sx={{ mt: 1 }}>
                      {account.owner_user_name && <Stack direction="row" spacing={1} alignItems="center"><Avatar src={account.owner_profile_image_url || undefined} sx={{ width: 28, height: 28, fontSize: '0.72rem' }}>{account.owner_user_name.slice(0, 1)}</Avatar><Box><Typography variant="caption" color="text.secondary" display="block">Account-Verantwortung</Typography><Typography variant="body2" fontWeight={850}>{account.owner_user_name}{account.owner_user_email ? ` (${account.owner_user_email})` : ''}</Typography></Box></Stack>}
                      {account.address && <Stack direction="row" spacing={1}><LocationOnOutlinedIcon color="action" /><Typography variant="body2" sx={{ whiteSpace: 'pre-line' }}>{account.address}</Typography></Stack>}
                      {account.contact_email && <Stack direction="row" spacing={1}><EmailOutlinedIcon color="action" /><Link href={`mailto:${account.contact_email}`}>{account.contact_email}</Link></Stack>}
                      {account.contact_phone && <Stack direction="row" spacing={1}><PhoneOutlinedIcon color="action" /><Link href={`tel:${account.contact_phone}`}>{account.contact_phone}</Link></Stack>}
                      {!account.address && !account.contact_email && !account.contact_phone && <Typography variant="body2" color="text.secondary">Noch keine zentralen Kontaktdaten hinterlegt.</Typography>}
                    </Stack>
                    <Divider sx={{ my: 2 }} />
                    <Typography variant="caption" color="text.secondary" fontWeight={850}>Regionen</Typography>
                    <Stack direction="row" spacing={0.7} useFlexGap flexWrap="wrap" sx={{ mt: 0.7 }}>
                      {(account.regions || []).map((region) => <Chip key={region.id} size="small" label={region.name} />)}
                      {(account.regions || []).length === 0 && <Typography variant="body2" color="text.secondary">Keine Angabe</Typography>}
                    </Stack>
                    <Typography variant="caption" color="text.secondary" fontWeight={850} sx={{ display: 'block', mt: 1.7 }}>Branchen/Kategorien</Typography>
                    <Stack direction="row" spacing={0.7} useFlexGap flexWrap="wrap" sx={{ mt: 0.7 }}>
                      {(account.categories || []).map((category) => <Chip key={category.id} size="small" label={category.name} variant="outlined" />)}
                      {(account.categories || []).length === 0 && <Typography variant="body2" color="text.secondary">Keine Angabe</Typography>}
                    </Stack>
                    {account.notes && <><Divider sx={{ my: 2 }} /><Typography variant="caption" color="text.secondary" fontWeight={850}>Notizen</Typography><Typography variant="body2" sx={{ mt: 0.7, whiteSpace: 'pre-line' }}>{account.notes}</Typography></>}
                  </Paper>
                </Grid>

                <Grid item xs={12} md={7}>
                  <Paper variant="outlined" sx={{ p: 2.2, borderRadius: 3, height: '100%' }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                      <Box>
                        <Typography variant="h6" fontWeight={900}>Ansprechpartner</Typography>
                        <Typography variant="caption" color="text.secondary">{contacts.length} hinterlegt</Typography>
                      </Box>
                      {!readOnly && <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={() => openContactForm()}>Hinzufügen</Button>}
                    </Stack>
                    <Stack spacing={1.1} sx={{ mt: 1.5 }}>
                      {contacts.map((contact) => (
                        <Paper key={contact.id} variant="outlined" sx={{ p: 1.4, borderRadius: 2.2 }}>
                          <Stack direction="row" spacing={1.2} alignItems="flex-start">
                            <Avatar sx={{ bgcolor: 'primary.main', width: 38, height: 38 }}><PersonOutlineIcon /></Avatar>
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                              <Stack direction="row" spacing={0.7} useFlexGap flexWrap="wrap" alignItems="center">
                                <Typography fontWeight={900}>{contact.name}</Typography>
                                {contact.is_primary && <Chip size="small" color="primary" label="Hauptkontakt" />}
                              </Stack>
                              {contact.job_title && <Typography variant="body2" color="text.secondary">{contact.job_title}</Typography>}
                              <Stack direction="row" spacing={1.2} useFlexGap flexWrap="wrap" sx={{ mt: 0.6 }}>
                                {contact.email && <Link variant="body2" href={`mailto:${contact.email}`}>{contact.email}</Link>}
                                {contact.phone && <Link variant="body2" href={`tel:${contact.phone}`}>{contact.phone}</Link>}
                                {safeWebUrl(contact.linkedin_url) && <Link variant="body2" href={safeWebUrl(contact.linkedin_url)} target="_blank" rel="noopener noreferrer">LinkedIn</Link>}
                              </Stack>
                              {contact.notes && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.7 }}>{contact.notes}</Typography>}
                            </Box>
                            {!readOnly && <Stack direction="row">
                              <Tooltip title="Bearbeiten"><IconButton size="small" onClick={() => openContactForm(contact)}><EditIcon fontSize="small" /></IconButton></Tooltip>
                              <Tooltip title="Löschen"><IconButton size="small" color="error" onClick={() => deleteContact(contact)}><DeleteOutlineIcon fontSize="small" /></IconButton></Tooltip>
                            </Stack>}
                          </Stack>
                        </Paper>
                      ))}
                      {contacts.length === 0 && <Alert severity="info" icon={<PersonOutlineIcon />}>Noch keine Ansprechpartner hinterlegt.</Alert>}
                    </Stack>
                  </Paper>
                </Grid>
              </Grid>

              {showCompetitors && <Paper variant="outlined" sx={{ p: 2.2, borderRadius: 3 }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} spacing={1}>
                  <Box>
                    <Typography variant="h6" fontWeight={900}>Wettbewerber</Typography>
                    <Typography variant="caption" color="text.secondary">{competitors.length} mit diesem Account verknüpft</Typography>
                  </Box>
                  {onManageCompetitors && <Button variant="outlined" startIcon={<TrackChangesIcon />} onClick={() => onManageCompetitors(account)}>Wettbewerber verwalten</Button>}
                </Stack>
                <Grid container spacing={1.2} sx={{ mt: 0.5 }}>
                  {competitors.map((competitor) => {
                    const competitorWebsite = safeWebUrl(competitor.website_url);
                    const competitorLinkedIn = safeWebUrl(competitor.linkedin_url);
                    return (
                      <Grid item xs={12} sm={6} md={4} key={competitor.id}>
                        <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2.2, height: '100%' }}>
                          <Typography fontWeight={900}>{competitor.name}</Typography>
                          <Stack direction="row" spacing={1.2} useFlexGap flexWrap="wrap" sx={{ mt: 0.7 }}>
                            {competitorWebsite && <Link variant="body2" href={competitorWebsite} target="_blank" rel="noopener noreferrer">Website</Link>}
                            {competitorLinkedIn && <Link variant="body2" href={competitorLinkedIn} target="_blank" rel="noopener noreferrer">LinkedIn</Link>}
                          </Stack>
                          {competitor.notes && <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{competitor.notes}</Typography>}
                        </Paper>
                      </Grid>
                    );
                  })}
                  {competitors.length === 0 && <Grid item xs={12}><Alert severity="info" icon={<TrackChangesIcon />}>Noch keine Wettbewerber zugeordnet.</Alert></Grid>}
                </Grid>
              </Paper>}
            </Stack>
          )}
        </DialogContent>
        <DialogActions><Button onClick={onClose}>Schließen</Button></DialogActions>
      </Dialog>

      <Dialog open={contactOpen} onClose={() => setContactOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{editingContact ? 'Ansprechpartner bearbeiten' : 'Ansprechpartner hinzufügen'}</DialogTitle>
        <DialogContent dividers>
          <Grid container spacing={2}>
            <Grid item xs={12}><TextField autoFocus required fullWidth label="Name" value={contactForm.name} onChange={(event) => setContactForm((current) => ({ ...current, name: event.target.value }))} /></Grid>
            <Grid item xs={12}><TextField fullWidth label="Funktion / Position" value={contactForm.job_title} onChange={(event) => setContactForm((current) => ({ ...current, job_title: event.target.value }))} /></Grid>
            <Grid item xs={12} sm={6}><TextField fullWidth type="email" label="E-Mail" value={contactForm.email} onChange={(event) => setContactForm((current) => ({ ...current, email: event.target.value }))} /></Grid>
            <Grid item xs={12} sm={6}><TextField fullWidth label="Telefon" value={contactForm.phone} onChange={(event) => setContactForm((current) => ({ ...current, phone: event.target.value }))} /></Grid>
            <Grid item xs={12}><TextField fullWidth label="LinkedIn-URL" placeholder="https://…" value={contactForm.linkedin_url} onChange={(event) => setContactForm((current) => ({ ...current, linkedin_url: event.target.value }))} /></Grid>
            <Grid item xs={12}><TextField fullWidth multiline rows={3} label="Notizen" inputProps={{ maxLength: 2000 }} value={contactForm.notes} onChange={(event) => setContactForm((current) => ({ ...current, notes: event.target.value }))} /></Grid>
            <Grid item xs={12}><FormControlLabel control={<Switch checked={contactForm.is_primary} onChange={(event) => setContactForm((current) => ({ ...current, is_primary: event.target.checked }))} />} label="Als Hauptkontakt markieren" /></Grid>
            {contactError && <Grid item xs={12}><Alert severity="error">{contactError}</Alert></Grid>}
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setContactOpen(false)}>Abbrechen</Button>
          <Button variant="contained" onClick={saveContact} disabled={contactSaving}>{contactSaving ? 'Speichert …' : 'Speichern'}</Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default AccountDetailDialog;
