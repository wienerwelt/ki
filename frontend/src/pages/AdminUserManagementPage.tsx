// frontend/src/pages/AdminUserManagementPage.tsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { 
    Box, Typography, Container, Paper, CircularProgress, Alert, Button, Table, TableBody, TableCell, 
    TableContainer, TableHead, TableRow, IconButton, Dialog, DialogTitle, DialogContent, DialogActions, 
    TextField, MenuItem, Switch, FormControlLabel, Chip, Tabs, Tab, TableSortLabel, InputAdornment, Tooltip, Snackbar, Grid
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import LinkedInIcon from '@mui/icons-material/LinkedIn';
import SearchIcon from '@mui/icons-material/Search';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import DownloadIcon from '@mui/icons-material/Download';
import apiClient from '../apiClient';
import { useAuth } from '../context/AuthContext';

// --- Interfaces ---
interface User {
  id: string;
  username: string;
  first_name: string | null;
  last_name: string | null;
  organization_name: string | null;
  email: string;
  linkedin_url: string | null;
  login_count: number;
  membership_level: string | null;
  role: string;
  business_partner_id: string | null;
  business_partner_name: string | null;
  is_active: boolean;
  last_login_at: string | null;
}

interface BusinessPartnerOption {
  id: string;
  name: string;
}

interface RoleOption {
  name: string;
  description: string;
}

interface MembershipLevels {
  level_1_name?: string;
  level_2_name?: string;
  level_3_name?: string;
}

// --- Sortier-Helferfunktionen ---
type Order = 'asc' | 'desc';

function descendingComparator<T>(a: T, b: T, orderBy: keyof T) {
  const valA = (a as any)[orderBy] ?? '';
  const valB = (b as any)[orderBy] ?? '';
  if (valB < valA) return -1;
  if (valB > valA) return 1;
  return 0;
}

function getComparator<Key extends keyof any>(
  order: Order,
  orderBy: Key,
): (a: { [key in Key]: any }, b: { [key in Key]: any }) => number {
  return order === 'desc'
    ? (a, b) => descendingComparator(a, b, orderBy)
    : (a, b) => -descendingComparator(a, b, orderBy);
}

const asArray = <T,>(v: any): T[] => (Array.isArray(v) ? v : []);

const AdminUserManagementPage: React.FC = () => {
  const { businessPartnerId: adminFilterBpId } = useParams<{ businessPartnerId?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user: loggedInUser } = useAuth();

  const isAdmin = loggedInUser?.role === 'admin';
  const isAssistant = loggedInUser?.role === 'assistenz';
  const businessPartnerNameFromState = (location.state as any)?.businessPartnerName;

  const [users, setUsers] = useState<User[]>([]);
  const [businessPartnerOptions, setBusinessPartnerOptions] = useState<BusinessPartnerOption[]>([]);
  const [roleOptions, setRoleOptions] = useState<RoleOption[]>([]);
  const [membershipLevels, setMembershipLevels] = useState<MembershipLevels | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [openDialog, setOpenDialog] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const [formUsername, setFormUsername] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formFirstName, setFormFirstName] = useState('');
  const [formLastName, setFormLastName] = useState('');
  const [formOrganizationName, setFormOrganizationName] = useState('');
  const [formLinkedinUrl, setFormLinkedinUrl] = useState('');
  const [formMembershipLevel, setFormMembershipLevel] = useState('');
  const [formRole, setFormRole] = useState('fleet_manager');
  const [formBusinessPartnerId, setFormBusinessPartnerId] = useState('');
  const [formIsActive, setFormIsActive] = useState(true);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [order, setOrder] = useState<Order>('asc');
  const [orderBy, setOrderBy] = useState<keyof User>('last_name');

  const [openImportDialog, setOpenImportDialog] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importReport, setImportReport] = useState<any>(null);
  const [snackbar, setSnackbar] = useState<{ open: boolean, message: string, severity: 'success' | 'error' }>({ open: false, message: '', severity: 'success' });

  // KORREKTUR: Die Logik zum Abrufen der Benutzer wurde in eine separate useCallback-Funktion
  // ausgelagert, um sie nach Änderungen wieder aufrufen zu können.
  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      let userUrl = '/api/admin/users';
      // Fall 1: Admin filtert nach einem bestimmten Partner
      if (isAdmin && adminFilterBpId) {
        userUrl = `/api/admin/users?business_partner_id=${adminFilterBpId}`;
      } 
      // Fall 2: Assistent ist eingeloggt (sieht nur eigene Partner-Benutzer)
      else if (isAssistant && loggedInUser?.business_partner_id) {
        userUrl = `/api/admin/users?business_partner_id=${loggedInUser.business_partner_id}`;
      }
      
      const userRes = await apiClient.get(userUrl);
      setUsers(asArray<User>(userRes.data));
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Fehler beim Laden der Benutzer.');
      setUsers([]);
    } finally {
        setLoading(false);
    }
  }, [isAdmin, isAssistant, adminFilterBpId, loggedInUser?.business_partner_id]);

  useEffect(() => {
    const fetchDropdownData = async () => {
      if (!loggedInUser || !isAdmin) return; // Dropdowns nur für Admins relevant
      try {
        const [bpRes, roleRes] = await Promise.all([
          apiClient.get('/api/admin/business-partners'),
          apiClient.get('/api/admin/roles'),
        ]);
        setBusinessPartnerOptions(asArray<any>(bpRes.data).map((bp: any) => ({ id: bp.id, name: bp.name })));
        setRoleOptions(asArray<RoleOption>(roleRes.data));
      } catch(err) {
        setError('Fehler beim Laden der Auswahloptionen.');
      }
    };
    
    fetchUsers();
    fetchDropdownData();
  }, [fetchUsers, isAdmin, loggedInUser]);

  useEffect(() => {
    const fetchLevels = async (bpId: string) => {
      if (!bpId) {
        setMembershipLevels(null);
        setFormMembershipLevel('');
        return;
      }
      try {
        const res = await apiClient.get(`/api/admin/business-partners/${bpId}/levels`);
        setMembershipLevels(res.data || null);
      } catch (err) {
        console.error('Could not fetch membership levels', err);
        setMembershipLevels(null);
      }
    };
    fetchLevels(formBusinessPartnerId);
  }, [formBusinessPartnerId]);

  const filteredRoleOptions = useMemo(() => {
    return isAssistant ? roleOptions.filter((role) => role.name !== 'admin') : roleOptions;
  }, [roleOptions, isAssistant]);

  const handleOpenAddDialog = () => {
    setEditingUser(null);
    setFormUsername('');
    setFormEmail('');
    setFormPassword('');
    setFormFirstName('');
    setFormLastName('');
    setFormOrganizationName('');
    setFormLinkedinUrl('');
    setFormMembershipLevel('');
    setFormRole('fleet_manager');
    setFormBusinessPartnerId(isAssistant ? (loggedInUser?.business_partner_id || '') : (adminFilterBpId || ''));
    setFormIsActive(true);
    setDialogError(null);
    setOpenDialog(true);
  };

  const handleOpenEditDialog = (user: User) => {
    setEditingUser(user);
    setFormUsername(user.username);
    setFormEmail(user.email);
    setFormPassword('');
    setFormFirstName(user.first_name || '');
    setFormLastName(user.last_name || '');
    setFormOrganizationName(user.organization_name || '');
    setFormLinkedinUrl(user.linkedin_url || '');
    setFormMembershipLevel(user.membership_level || '');
    setFormRole(user.role);
    setFormBusinessPartnerId(user.business_partner_id || '');
    setFormIsActive(user.is_active);
    setDialogError(null);
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setEditingUser(null);
  };

  const handleSubmit = async () => {
    setDialogError(null);
    const userData = {
      username: formUsername,
      email: formEmail,
      password: formPassword || undefined,
      first_name: formFirstName || null,
      last_name: formLastName || null,
      organization_name: formOrganizationName || null,
      linkedin_url: formLinkedinUrl || null,
      membership_level: formMembershipLevel || null,
      role: formRole,
      business_partner_id: formBusinessPartnerId || null,
      is_active: formIsActive,
    };

    try {
      if (editingUser) {
        await apiClient.put(`/api/admin/users/${editingUser.id}`, userData);
      } else {
        if (!formPassword) {
          setDialogError('Passwort ist für neue Benutzer erforderlich.');
          return;
        }
        await apiClient.post('/api/admin/users', userData);
      }
      handleCloseDialog();
      fetchUsers();
    } catch (err: any) {
      setDialogError(err?.response?.data?.message || 'Fehler beim Speichern des Benutzers.');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Sind Sie sicher, dass Sie diesen Benutzer löschen möchten?')) return;
    try {
      await apiClient.delete(`/api/admin/users/${id}`);
      fetchUsers();
    } catch (err: any) {
      setSnackbar({ open: true, message: 'Löschen fehlgeschlagen: ' + (err?.response?.data?.message || 'Serverfehler'), severity: 'error' });
    }
  };

  const handleExport = async () => {
    try {
      const apiBase = (import.meta as any).env?.VITE_API_URL || '';
      const res = await fetch(`${apiBase}/api/admin/users/export/csv`, { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'benutzer-export.csv');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      setSnackbar({ open: true, message: 'Export fehlgeschlagen: ' + (err?.message || 'Unbekannter Fehler'), severity: 'error' });
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      setSelectedFile(event.target.files[0]);
    }
  };

  const handleImport = async () => {
    if (!selectedFile) return;
    setImporting(true);
    setImportReport(null);
    const formData = new FormData();
    formData.append('csvfile', selectedFile);

    try {
      const response = await apiClient.post('/api/admin/users/import/csv', formData);
      setImportReport(response.data);
      fetchUsers();
    } catch (err: any) {
      setImportReport({ errors: [err?.response?.data?.message || 'Import fehlgeschlagen.'] });
    } finally {
      setImporting(false);
    }
  };

  const handleSortRequest = (property: keyof User) => {
    const isAsc = orderBy === property && order === 'asc';
    setOrder(isAsc ? 'desc' : 'asc');
    setOrderBy(property);
  };

  const sortedAndFilteredUsers: User[] = useMemo(() => {
    let filtered: User[] = [...users];
    if (statusFilter !== 'all') {
      filtered = filtered.filter((user) => user.is_active === (statusFilter === 'active'));
    }
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      filtered = filtered.filter((user) =>
        (user.username || '').toLowerCase().includes(q) ||
        (user.first_name || '').toLowerCase().includes(q) ||
        (user.last_name || '').toLowerCase().includes(q) ||
        (user.organization_name || '').toLowerCase().includes(q) ||
        (user.email || '').toLowerCase().includes(q)
      );
    }
    return filtered.sort(getComparator(order, orderBy));
  }, [users, searchTerm, order, orderBy, statusFilter]);

  return (
      <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 2 }}>
          <Box>
            <Typography variant="h4" component="h1">Benutzerverwaltung</Typography>
            {isAdmin && adminFilterBpId && (
              <Chip
                label={`Admin-Filter: ${businessPartnerNameFromState || businessPartnerOptions.find(bp => bp.id === adminFilterBpId)?.name}`}
                onDelete={() => navigate('/admin/users')}
                sx={{ mt: 1 }}
              />
            )}
            {isAssistant && (
              <Typography variant="subtitle1" color="text.secondary" sx={{ mt: 1 }}>
                Verwaltung für: <strong>{loggedInUser?.business_partner_name}</strong>
              </Typography>
            )}
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <TextField
              variant="outlined"
              size="small"
              placeholder="Suchen..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              InputProps={{ startAdornment: (<InputAdornment position="start"><SearchIcon /></InputAdornment>) }}
            />
            <Button variant="outlined" startIcon={<DownloadIcon />} onClick={handleExport}>Exportieren</Button>
            <Button variant="outlined" startIcon={<UploadFileIcon />} onClick={() => setOpenImportDialog(true)}>Importieren</Button>
            <Button variant="contained" startIcon={<AddIcon />} onClick={handleOpenAddDialog}>Benutzer hinzufügen</Button>
          </Box>
        </Box>

        <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
          <Tabs value={statusFilter} onChange={(_e, v) => setStatusFilter(v)}>
            <Tab label={`Alle (${users.length})`} value="all" />
            <Tab label={`Aktiv (${users.filter((u) => u.is_active).length})`} value="active" />
            <Tab label={`Inaktiv (${users.filter((u) => !u.is_active).length})`} value="inactive" />
          </Tabs>
        </Box>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
            <CircularProgress />
          </Box>
        ) : error ? (
          <Alert severity="error">{error}</Alert>
        ) : (
          <Paper>
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell sortDirection={orderBy === 'last_name' ? order : false}>
                      <TableSortLabel active={orderBy === 'last_name'} direction={order} onClick={() => handleSortRequest('last_name')}>
                        Name
                      </TableSortLabel>
                    </TableCell>
                    <TableCell sortDirection={orderBy === 'organization_name' ? order : false}>
                      <TableSortLabel active={orderBy === 'organization_name'} direction={order} onClick={() => handleSortRequest('organization_name')}>
                        Organisation
                      </TableSortLabel>
                    </TableCell>
                    {isAdmin && <TableCell>Business Partner</TableCell>}
                    <TableCell>E-Mail</TableCell>
                    <TableCell sortDirection={orderBy === 'membership_level' ? order : false}>
                      <TableSortLabel active={orderBy === 'membership_level'} direction={order} onClick={() => handleSortRequest('membership_level')}>
                        Mitgliedslevel
                      </TableSortLabel>
                    </TableCell>
                    <TableCell align="center" sortDirection={orderBy === 'login_count' ? order : false}>
                      <TableSortLabel active={orderBy === 'login_count'} direction={order} onClick={() => handleSortRequest('login_count')}>
                        Logins
                      </TableSortLabel>
                    </TableCell>
                    <TableCell>Aktionen</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {sortedAndFilteredUsers.map((user) => (
                    <TableRow key={user.id} hover sx={{ backgroundColor: user.is_active ? 'inherit' : '#fafafa' }}>
                      <TableCell>{user.first_name} {user.last_name}</TableCell>
                      <TableCell>{user.organization_name || '-'}</TableCell>
                      {isAdmin && <TableCell>{user.business_partner_name || '-'}</TableCell>}
                      <TableCell>{user.email}</TableCell>
                      <TableCell>{user.membership_level || '-'}</TableCell>
                      <TableCell align="center">{user.login_count}</TableCell>
                      <TableCell>
                        {user.linkedin_url && (
                          <IconButton href={user.linkedin_url} target="_blank" size="small">
                            <LinkedInIcon />
                          </IconButton>
                        )}
                        <Tooltip title="Bearbeiten">
                          <IconButton color="primary" onClick={() => handleOpenEditDialog(user)} size="small">
                            <EditIcon />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Löschen">
                          <IconButton color="error" onClick={() => handleDelete(user.id)} size="small">
                            <DeleteIcon />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        )}

        <Dialog open={openDialog} onClose={handleCloseDialog} fullWidth maxWidth="sm">
          <DialogTitle>{editingUser ? 'Benutzer bearbeiten' : 'Neuen Benutzer hinzufügen'}</DialogTitle>
          <DialogContent>
            {dialogError && <Alert severity="error" sx={{ mb: 2 }}>{dialogError}</Alert>}
            <Grid container spacing={2} sx={{ pt: 1 }}>
              <Grid item xs={12} sm={6}>
                <TextField label="Vorname" fullWidth value={formFirstName} onChange={(e) => setFormFirstName(e.target.value)} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField label="Nachname" fullWidth value={formLastName} onChange={(e) => setFormLastName(e.target.value)} />
              </Grid>
              <Grid item xs={12}>
                <TextField label="Organisation" fullWidth value={formOrganizationName} onChange={(e) => setFormOrganizationName(e.target.value)} />
              </Grid>
              <Grid item xs={12}>
                <TextField label="LinkedIn URL (optional)" fullWidth value={formLinkedinUrl} onChange={(e) => setFormLinkedinUrl(e.target.value)} />
              </Grid>
              <Grid item xs={12}>
                <TextField label="Username" fullWidth value={formUsername} onChange={(e) => setFormUsername(e.target.value)} disabled={!!editingUser} />
              </Grid>
              <Grid item xs={12}>
                <TextField label="E-Mail" type="email" fullWidth value={formEmail} onChange={(e) => setFormEmail(e.target.value)} />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  label={editingUser ? 'Neues Passwort (leer lassen)' : 'Passwort'}
                  type="password"
                  fullWidth
                  value={formPassword}
                  onChange={(e) => setFormPassword(e.target.value)}
                />
              </Grid>
            </Grid>

            <TextField
              select
              margin="dense"
              label="Rolle"
              fullWidth
              value={formRole}
              onChange={(e) => setFormRole(e.target.value)}
              sx={{ mt: 2 }}
              disabled={isAssistant}
            >
              {filteredRoleOptions.map((role) => (
                <MenuItem key={role.name} value={role.name} title={role.description}>
                  {role.name}
                </MenuItem>
              ))}
            </TextField>

            {isAdmin && (
              <TextField
                select
                margin="dense"
                label="Business Partner"
                fullWidth
                value={formBusinessPartnerId}
                onChange={(e) => setFormBusinessPartnerId(e.target.value)}
                sx={{ mt: 2 }}
                disabled={isAssistant}
              >
                <MenuItem value="">
                  <em>Kein Business Partner</em>
                </MenuItem>
                {businessPartnerOptions.map((bp) => (
                  <MenuItem key={bp.id} value={bp.id}>
                    {bp.name}
                  </MenuItem>
                ))}
              </TextField>
            )}

            <TextField
              select
              margin="dense"
              label="Mitgliedslevel"
              fullWidth
              value={formMembershipLevel}
              onChange={(e) => setFormMembershipLevel(e.target.value)}
              sx={{ mt: 2 }}
              disabled={!formBusinessPartnerId}
            >
              <MenuItem value="">
                <em>Kein Level</em>
              </MenuItem>
              {membershipLevels &&
                Object.values(membershipLevels).map(
                  (level) => level && (
                    <MenuItem key={level} value={level}>
                      {level}
                    </MenuItem>
                  )
                )}
            </TextField>

            <FormControlLabel
              control={<Switch checked={formIsActive} onChange={(e) => setFormIsActive(e.target.checked)} color="primary" />}
              label="Aktiv"
              sx={{ mt: 2 }}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={handleCloseDialog}>Abbrechen</Button>
            <Button onClick={handleSubmit}>{editingUser ? 'Speichern' : 'Hinzufügen'}</Button>
          </DialogActions>
        </Dialog>
        
        <Dialog open={openImportDialog} onClose={() => setOpenImportDialog(false)} fullWidth maxWidth="sm">
          <DialogTitle>Benutzer importieren</DialogTitle>
          <DialogContent>
            <Typography gutterBottom>
              Wählen Sie eine CSV-Datei zum Hochladen aus. Erforderliche Spalten: <strong>username, email, password, role, first_name, last_name, organization_name, linkedin_url, membership_level</strong>.
            </Typography>
            <Button variant="contained" component="label" sx={{ mt: 2 }}>
              Datei auswählen
              <input type="file" hidden accept=".csv" onChange={handleFileChange} />
            </Button>
            {selectedFile && <Typography sx={{ mt: 1, fontStyle: 'italic' }}>{selectedFile.name}</Typography>}
            {importing && <CircularProgress sx={{ display: 'block', margin: '20px auto' }} />}
            {importReport && (
              <Box sx={{ mt: 2, p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                <Typography variant="h6">Import-Bericht</Typography>
                <Typography color="success.main">Erfolgreich: {importReport.successCount || 0}</Typography>
                <Typography color="error.main">Fehlerhaft: {importReport.errorCount || 0}</Typography>
                {importReport.errors && importReport.errors.length > 0 && (
                  <Box component="ul" sx={{ pl: 2, maxHeight: 150, overflowY: 'auto' }}>
                    {importReport.errors.map((e: string, i: number) => (
                      <li key={i}>
                        <Typography variant="body2" color="error">
                          {e}
                        </Typography>
                      </li>
                    ))}
                  </Box>
                )}
              </Box>
            )}
          </DialogContent>
          <DialogActions>
            <Button
              onClick={() => {
                setOpenImportDialog(false);
                setImportReport(null);
                setSelectedFile(null);
              }}
            >
              Schließen
            </Button>
            <Button onClick={handleImport} disabled={!selectedFile || importing}>
              {importing ? 'Importiere...' : 'Import starten'}
            </Button>
          </DialogActions>
        </Dialog>

        <Snackbar
          open={snackbar.open}
          autoHideDuration={6000}
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
          <Alert onClose={() => setSnackbar({ ...snackbar, open: false })} severity={snackbar.severity} sx={{ width: '100%' }}>
            {snackbar.message}
          </Alert>
        </Snackbar>
      </Container>
  );
};

export default AdminUserManagementPage;