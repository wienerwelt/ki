import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { 
    Box, Typography, Container, Paper, CircularProgress, Alert, Button, Table, TableBody, TableCell, 
    TableContainer, TableHead, TableRow, IconButton, Dialog, DialogTitle, DialogContent, DialogActions, 
    TextField, MenuItem, Switch, FormControlLabel, Chip, Tabs, Tab, TableSortLabel, InputAdornment, Tooltip, Snackbar, Grid,
    Avatar, List, ListItem, ListItemText, Divider
} from '@mui/material';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import LinkedInIcon from '@mui/icons-material/LinkedIn';
import SearchIcon from '@mui/icons-material/Search';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import DownloadIcon from '@mui/icons-material/Download';
import QrCodeIcon from '@mui/icons-material/QrCode';
import InfoIcon from '@mui/icons-material/Info';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import DashboardCustomizeIcon from '@mui/icons-material/DashboardCustomize';
import LoginIcon from '@mui/icons-material/Login';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
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
  newsletter_opt_in: boolean;
  linkedin_url: string | null;
  login_count: number;
  membership_level: string | null;
  role: string;
  business_partner_id: string | null;
  business_partner_name: string | null;
  is_active: boolean;
  active_until: string | null;
  last_login_at: string | null;
  profile_image_url: string | null;
}

interface BusinessPartnerOption { id: string; name: string; user_count: number; }
interface RoleOption { name: string; description: string; }
interface MembershipLevels { level_1_name?: string; level_2_name?: string; level_3_name?: string; }

interface InstalledWidget {
    widget_name: string;
    type_key: string;
    count: number;
}
interface UserStats {
    registered_at: string;
    last_login_at: string | null;
    contribution_score: number;
    linkedin_url: string | null;
    total_widgets: number;
    installed_widgets: InstalledWidget[];
}

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
  const { user: loggedInUser, isLoading: isAuthLoading } = useAuth();

  const isAdmin = loggedInUser?.role === 'admin';
  const isAssistant = loggedInUser?.role === 'assistenz';
  const businessPartnerNameFromState = (location.state as any)?.businessPartnerName;

  const currentBpId = isAssistant ? loggedInUser?.business_partner_id : adminFilterBpId;

  const [users, setUsers] = useState<User[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [businessPartnerOptions, setBusinessPartnerOptions] = useState<BusinessPartnerOption[]>([]);
  const [roleOptions, setRoleOptions] = useState<RoleOption[]>([]);
  const [membershipLevels, setMembershipLevels] = useState<MembershipLevels | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [openDialog, setOpenDialog] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const [statsModalOpen, setStatsModalOpen] = useState(false);
  const [selectedUserForStats, setSelectedUserForStats] = useState<User | null>(null);
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  const [formUsername, setFormUsername] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formFirstName, setFormFirstName] = useState('');
  const [formLastName, setFormLastName] = useState('');
  const [formOrganizationName, setFormOrganizationName] = useState('');
  const [formLinkedinUrl, setFormLinkedinUrl] = useState('');
  const [formMembershipLevel, setFormMembershipLevel] = useState('');
  const [formRole, setFormRole] = useState('user');
  const [formBusinessPartnerId, setFormBusinessPartnerId] = useState('');
  const [formIsActive, setFormIsActive] = useState(true);
  const [formActiveUntil, setFormActiveUntil] = useState('');
  const [formProfileImageUrl, setFormProfileImageUrl] = useState('');

  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedBpFilter, setSelectedBpFilter] = useState<string>('all'); 
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [order, setOrder] = useState<Order>('asc');
  const [orderBy, setOrderBy] = useState<keyof User>('last_name');

  const [openImportDialog, setOpenImportDialog] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importReport, setImportReport] = useState<any>(null);
  const [snackbar, setSnackbar] = useState<{ open: boolean, message: string, severity: 'success' | 'error' }>({ open: false, message: '', severity: 'success' });

  // Debounce für Serverseitige Suche
  useEffect(() => {
      const timer = setTimeout(() => setDebouncedSearch(searchTerm), 500);
      return () => clearTimeout(timer);
  }, [searchTerm]);

  const handleDownloadTemplate = async () => {
    try {
      const token = localStorage.getItem('jwt_token');
      if (!token) throw new Error('Authentifizierungs-Token nicht gefunden.');
      const apiBase = (import.meta as any).env?.VITE_API_URL || '';
      
      const res = await fetch(`${apiBase}/api/admin/users/import/template`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'benutzer-import-vorlage.csv');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      setSnackbar({ open: true, message: 'Download der Vorlage fehlgeschlagen: ' + (err?.message || 'Unbekannter Fehler'), severity: 'error' });
    }
  };

  const fetchUsers = useCallback(async (currentPage = 1, bpFilterOverride?: string, searchOverride?: string) => {
    if (isAssistant && !loggedInUser?.business_partner_id) {
        setUsers([]); setLoading(false); return;
    }
    if (currentPage === 1) setLoading(true);
    try {
      const filterToUse = bpFilterOverride !== undefined ? bpFilterOverride : selectedBpFilter;
      const searchToUse = searchOverride !== undefined ? searchOverride : debouncedSearch;
      
      let userUrl = `/api/admin/users?page=${currentPage}&limit=50`;
      
      if (isAdmin && filterToUse !== 'all') {
        userUrl += `&business_partner_id=${filterToUse}`;
      } else if (isAdmin && adminFilterBpId) {
        userUrl += `&business_partner_id=${adminFilterBpId}`;
      } else if (isAssistant && loggedInUser?.business_partner_id) {
        userUrl += `&business_partner_id=${loggedInUser.business_partner_id}`;
      }

      if (searchToUse) {
        userUrl += `&search=${encodeURIComponent(searchToUse)}`;
      }
      
      const userRes = await apiClient.get(userUrl);
      const newUsers = asArray<User>(userRes.data);
      
      if (currentPage === 1) {
          setUsers(newUsers);
      } else {
          setUsers(prev => [...prev, ...newUsers]);
      }
      setHasMore(newUsers.length === 50);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Fehler beim Laden der Benutzer.');
      if (currentPage === 1) setUsers([]);
    } finally {
        setLoading(false);
    }
  }, [isAdmin, isAssistant, adminFilterBpId, loggedInUser?.business_partner_id, selectedBpFilter, debouncedSearch]);

  useEffect(() => {
    const fetchDropdownData = async () => {
        if (!loggedInUser || !isAdmin) return;
        try {
            const [bpRes, roleRes] = await Promise.all([
                apiClient.get('/api/admin/business-partners'),
                apiClient.get('/api/admin/roles'),
            ]);
            setBusinessPartnerOptions(asArray<any>(bpRes.data).map((bp: any) => ({ id: bp.id, name: bp.name, user_count: bp.user_count || 0 })));
            setRoleOptions(asArray<RoleOption>(roleRes.data));
        } catch(err) {
            setError('Fehler beim Laden der Auswahloptionen.');
        }
    };
    if (!isAuthLoading) {
        setPage(1);
        fetchUsers(1);
        fetchDropdownData();
    }
  }, [isAdmin, loggedInUser, isAuthLoading]);

  // Effekt triggert serverseitige Suche wenn der debounced Suchbegriff sich ändert
  useEffect(() => {
    if (!isAuthLoading) {
        setPage(1);
        fetchUsers(1, undefined, debouncedSearch);
    }
  }, [debouncedSearch]); 

  const handleBpFilterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newBp = e.target.value;
    setSelectedBpFilter(newBp);
    setPage(1);
    fetchUsers(1, newBp, debouncedSearch);
  };

  useEffect(() => {
    const fetchLevels = async (bpId: string) => {
      if (!bpId) {
        setMembershipLevels(null); setFormMembershipLevel(''); return;
      }
      try {
        const res = await apiClient.get(`/api/admin/business-partners/${bpId}/levels`);
        setMembershipLevels(res.data || null);
      } catch (err) {
        setMembershipLevels(null);
      }
    };
    fetchLevels(formBusinessPartnerId);
  }, [formBusinessPartnerId]);

  const handleOpenStats = async (user: User) => {
      setSelectedUserForStats(user);
      setStatsModalOpen(true);
      setStatsLoading(true);
      setUserStats(null);
      try {
          const res = await apiClient.get(`/api/admin/users/${user.id}/statistics`);
          setUserStats(res.data);
      } catch(err) {
          console.error("Fehler beim Laden der Statistiken", err);
      } finally {
          setStatsLoading(false);
      }
  };

  const handleCloseStats = () => {
      setStatsModalOpen(false);
      setSelectedUserForStats(null);
  };

  const filteredRoleOptions = useMemo(() => {
    return isAssistant ? roleOptions.filter((role) => role.name !== 'admin') : roleOptions;
  }, [roleOptions, isAssistant]);

  const handleOpenAddDialog = () => {
    setEditingUser(null); setFormUsername(''); setFormEmail(''); setFormPassword(''); setFormFirstName(''); setFormLastName(''); setFormOrganizationName(''); setFormLinkedinUrl(''); setFormProfileImageUrl(''); setFormMembershipLevel(''); setFormRole('user'); setFormBusinessPartnerId(isAssistant ? (loggedInUser?.business_partner_id || '') : (adminFilterBpId || '')); setFormIsActive(true); setFormActiveUntil(''); setDialogError(null); setOpenDialog(true);
  };

  const handleOpenEditDialog = (user: User) => {
    setEditingUser(user); setFormUsername(user.username); setFormEmail(user.email); setFormPassword(''); setFormFirstName(user.first_name || ''); setFormLastName(user.last_name || ''); setFormOrganizationName(user.organization_name || ''); setFormLinkedinUrl(user.linkedin_url || ''); setFormMembershipLevel(user.membership_level || ''); setFormRole(user.role); setFormBusinessPartnerId(user.business_partner_id || ''); setFormIsActive(user.is_active); setFormActiveUntil(user.active_until ? user.active_until.split('T')[0] : ''); setFormProfileImageUrl(user.profile_image_url || ''); setDialogError(null); setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false); setEditingUser(null);
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
      profile_image_url: formProfileImageUrl || null, 
      membership_level: formMembershipLevel || null, 
      role: formRole, 
      business_partner_id: formBusinessPartnerId || null, 
      is_active: formIsActive,
      active_until: formActiveUntil || null
    };
    try {
      if (editingUser) {
        await apiClient.put(`/api/admin/users/${editingUser.id}`, userData);
      } else {
        if (!formPassword) { setDialogError('Passwort ist für neue Benutzer erforderlich.'); return; }
        await apiClient.post('/api/admin/users', userData);
      }
      handleCloseDialog();
      setPage(1);
      fetchUsers(1);
    } catch (err: any) {
      setDialogError(err?.response?.data?.message || 'Fehler beim Speichern des Benutzers.');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Sind Sie sicher, dass Sie diesen Benutzer löschen möchten?')) return;
    try {
      await apiClient.delete(`/api/admin/users/${id}`);
      setPage(1);
      fetchUsers(1);
    } catch (err: any) {
      setSnackbar({ open: true, message: 'Löschen fehlgeschlagen: ' + (err?.response?.data?.message || 'Serverfehler'), severity: 'error' });
    }
  };

  const handleExport = async () => {
    try {
      const token = localStorage.getItem('jwt_token');
      if (!token) throw new Error('Authentifizierungs-Token nicht gefunden.');
      const apiBase = (import.meta as any).env?.VITE_API_URL || '';
      
      let filter = (isAdmin && selectedBpFilter !== 'all') ? `?business_partner_id=${selectedBpFilter}` : '';
      if (debouncedSearch) {
          filter += filter ? `&search=${encodeURIComponent(debouncedSearch)}` : `?search=${encodeURIComponent(debouncedSearch)}`;
      }
      
      const res = await fetch(`${apiBase}/api/admin/users/export/csv${filter}`, { headers: { 'Authorization': `Bearer ${token}` } });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;

      // Dateiname mit Partner und Datum
      let bpName = 'Alle_Partner';
      if (isAdmin && selectedBpFilter !== 'all') {
          bpName = businessPartnerOptions.find(bp => bp.id === selectedBpFilter)?.name || 'Partner';
      } else if (isAssistant) {
          bpName = loggedInUser?.business_partner_name || 'Partner';
      }
      const safeBpName = bpName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const dateStr = new Date().toISOString().split('T')[0];
      const filename = `benutzer-export-${safeBpName}-${dateStr}.csv`;
      
      link.setAttribute('download', filename);
      document.body.appendChild(link); link.click(); link.remove(); window.URL.revokeObjectURL(url);
    } catch (err: any) {
      setSnackbar({ open: true, message: 'Export fehlgeschlagen: ' + (err?.message || 'Unbekannter Fehler'), severity: 'error' });
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) setSelectedFile(event.target.files[0]);
  };

  const handleImport = async () => {
    if (!selectedFile) return;
    setImporting(true); setImportReport(null);
    const formData = new FormData();
    formData.append('csvfile', selectedFile);

    try {
      const response = await apiClient.post('/api/admin/users/import/csv', formData);
      setImportReport(response.data);
      setPage(1);
      fetchUsers(1);
    } catch (err: any) {
      setImportReport({ errors: [err?.response?.data?.message || 'Import fehlgeschlagen.'] });
    } finally {
      setImporting(false);
    }
  };

  const handleSortRequest = (property: keyof User) => {
    const isAsc = orderBy === property && order === 'asc';
    setOrder(isAsc ? 'desc' : 'asc'); setOrderBy(property);
  };

  const sortedAndFilteredUsers: User[] = useMemo(() => {
    let filtered: User[] = [...users];
    
    if (statusFilter !== 'all') {
      filtered = filtered.filter((user) => user.is_active === (statusFilter === 'active'));
    }
    
    // Client-seitige Zusatz-Filterung für sofortiges Feedback
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

  const activeCount = users.filter((u) => u.is_active).length;
  const inactiveCount = users.filter((u) => !u.is_active).length;
  const showPlus = hasMore ? '+' : '';

  // Helper für den Farb-Indikator
  const getStatusInfo = (u: User) => {
    if (!u.is_active) return { color: 'error.main', title: 'Inaktiv' };
    if (u.active_until) {
        const expiryDate = new Date(u.active_until);
        const now = new Date();
        const daysLeft = (expiryDate.getTime() - now.getTime()) / (1000 * 3600 * 24);
        
        if (daysLeft < 0) return { color: 'error.main', title: 'Abgelaufen' };
        if (daysLeft <= 30) return { color: 'warning.main', title: 'Läuft in weniger als 30 Tagen ab' };
    }
    return { color: 'success.main', title: 'Aktiv' };
  };

  return (
      <Container maxWidth="xl" sx={{ mt: 4, mb: 4, pb: hasMore ? 8 : 0 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 2 }}>
          <Box>
            <Typography variant="h4" component="h1">Benutzerverwaltung</Typography>
            {isAdmin && adminFilterBpId && (
              <Chip label={`Admin-Filter: ${businessPartnerNameFromState || businessPartnerOptions.find(bp => bp.id === adminFilterBpId)?.name}`} onDelete={() => navigate('/admin/users')} sx={{ mt: 1 }} />
            )}
            {isAssistant && (
              <Typography variant="subtitle1" color="text.secondary" sx={{ mt: 1 }}>Verwaltung für: <strong>{loggedInUser?.business_partner_name}</strong></Typography>
            )}
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            {currentBpId && (
                <Button variant="outlined" startIcon={<QrCodeIcon />} onClick={() => window.open(`/invite/${currentBpId}`, '_blank')} sx={{ borderColor: 'primary.main', color: 'primary.main', mr: 1 }}>
                    Mitglieder einladen
                </Button>
            )}

            {isAdmin && !adminFilterBpId && (
                <TextField
                    select
                    size="small"
                    label="Partner Filter"
                    value={selectedBpFilter}
                    onChange={handleBpFilterChange}
                    sx={{ minWidth: 180 }}
                >
                    <MenuItem value="all">Alle Partner</MenuItem>
                      {businessPartnerOptions.map((bp) => (
                          <MenuItem key={bp.id} value={bp.id}>{bp.name} ({bp.user_count})</MenuItem>
                      ))}
                </TextField>
            )}

            <TextField variant="outlined" size="small" placeholder="Suchen..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} InputProps={{ startAdornment: (<InputAdornment position="start"><SearchIcon /></InputAdornment>) }} />
            <Button variant="outlined" startIcon={<DownloadIcon />} onClick={handleExport}>Export</Button>
            <Button variant="outlined" startIcon={<UploadFileIcon />} onClick={() => setOpenImportDialog(true)}>Import</Button>
            <Button variant="contained" startIcon={<AddIcon />} onClick={handleOpenAddDialog}>Hinzufügen</Button>
          </Box>
        </Box>

        <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
          <Tabs value={statusFilter} onChange={(_e, v) => setStatusFilter(v)}>
            <Tab label={`Alle (${users.length}${showPlus})`} value="all" />
            <Tab label={`Aktiv (${activeCount}${showPlus})`} value="active" />
            <Tab label={`Inaktiv (${inactiveCount}${showPlus})`} value="inactive" />
          </Tabs>
        </Box>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}><CircularProgress /></Box>
        ) : error ? (
          <Alert severity="error">{error}</Alert>
        ) : (
          <Paper sx={{ overflow: 'visible' }}>
            <TableContainer sx={{ overflowX: 'auto' }}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Avatar</TableCell>
                    <TableCell sortDirection={orderBy === 'last_name' ? order : false}><TableSortLabel active={orderBy === 'last_name'} direction={order} onClick={() => handleSortRequest('last_name')}>Name</TableSortLabel></TableCell>
                    <TableCell sortDirection={orderBy === 'organization_name' ? order : false}><TableSortLabel active={orderBy === 'organization_name'} direction={order} onClick={() => handleSortRequest('organization_name')}>Organisation</TableSortLabel></TableCell>
                    {isAdmin && <TableCell sortDirection={orderBy === 'business_partner_name' ? order : false}><TableSortLabel active={orderBy === 'business_partner_name'} direction={order} onClick={() => handleSortRequest('business_partner_name')}>Business Partner</TableSortLabel></TableCell>}
                    <TableCell sortDirection={orderBy === 'email' ? order : false}><TableSortLabel active={orderBy === 'email'} direction={order} onClick={() => handleSortRequest('email')}>E-Mail</TableSortLabel></TableCell>
                    <TableCell sortDirection={orderBy === 'membership_level' ? order : false}><TableSortLabel active={orderBy === 'membership_level'} direction={order} onClick={() => handleSortRequest('membership_level')}>Level</TableSortLabel></TableCell>
                    <TableCell sortDirection={orderBy === 'role' ? order : false}><TableSortLabel active={orderBy === 'role'} direction={order} onClick={() => handleSortRequest('role')}>Rolle</TableSortLabel></TableCell>
                    <TableCell sortDirection={orderBy === 'active_until' ? order : false}><TableSortLabel active={orderBy === 'active_until'} direction={order} onClick={() => handleSortRequest('active_until')}>Aktiv bis</TableSortLabel></TableCell>
                    <TableCell sortDirection={orderBy === 'last_login_at' ? order : false}><TableSortLabel active={orderBy === 'last_login_at'} direction={order} onClick={() => handleSortRequest('last_login_at')}>Letzter Login</TableSortLabel></TableCell>
                    <TableCell align="right" sx={{ position: 'sticky', right: 0, bgcolor: 'background.paper', zIndex: 2, boxShadow: '-2px 0 5px rgba(0,0,0,0.05)' }}>
                        Aktionen
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {sortedAndFilteredUsers.map((u) => {
                    const statusInfo = getStatusInfo(u);
                    
                    return (
                        <TableRow 
                            key={u.id} 
                            hover 
                            sx={{ 
                                backgroundColor: u.is_active ? 'inherit' : '#f1f5f9',
                                opacity: u.is_active ? 1 : 0.55,
                                transition: 'opacity 0.2s, background-color 0.2s',
                                '&:hover': { opacity: 1 }
                            }}
                        >
                        <TableCell>
                            <Avatar src={u.profile_image_url || undefined} alt={u.first_name || 'User'} sx={{ width: 32, height: 32 }}>
                                {u.first_name ? u.first_name.charAt(0) : '?'}
                            </Avatar>
                        </TableCell>      
                        <TableCell>{u.first_name} {u.last_name}</TableCell>
                        <TableCell>{u.organization_name || '-'}</TableCell>
                        {isAdmin && <TableCell>{u.business_partner_name || '-'}</TableCell>}
                        
                        <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                <Tooltip title={u.newsletter_opt_in ? 'Newsletter abonniert' : 'Kein Newsletter'}>
                                    <Box 
                                        sx={{ 
                                            width: 10, height: 10, borderRadius: '50%', 
                                            bgcolor: u.newsletter_opt_in ? 'success.main' : 'error.main', flexShrink: 0 
                                        }} 
                                    />
                                </Tooltip>
                                <Typography variant="body2" sx={{ whiteSpace: 'nowrap' }}>
                                    {u.email}
                                </Typography>
                            </Box>
                        </TableCell>

                        <TableCell>{u.membership_level || '-'}</TableCell>
                        <TableCell>{u.role}</TableCell>
                        
                        <TableCell>
                            <Tooltip title={statusInfo.title}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: statusInfo.color, flexShrink: 0 }} />
                                    <Typography variant="body2">{u.active_until ? new Date(u.active_until).toLocaleDateString('de-AT') : 'Unbegrenzt'}</Typography>
                                </Box>
                            </Tooltip>
                        </TableCell>
                        
                        <TableCell>
                            {u.last_login_at ? new Date(u.last_login_at).toLocaleDateString('de-AT') : '-'}
                        </TableCell>

                        <TableCell align="right" sx={{ whiteSpace: 'nowrap', position: 'sticky', right: 0, bgcolor: u.is_active ? 'background.paper' : '#f1f5f9', zIndex: 1, boxShadow: '-2px 0 5px rgba(0,0,0,0.05)' }}>
                            {u.linkedin_url && (
                            <Tooltip title="LinkedIn Profil aufrufen">
                                <IconButton href={u.linkedin_url} target="_blank" size="small"><LinkedInIcon color="primary" /></IconButton>
                            </Tooltip>
                            )}
                            <Tooltip title="Nutzer-Statistiken ansehen">
                            <IconButton color="info" onClick={() => handleOpenStats(u)} size="small"><InfoIcon /></IconButton>
                            </Tooltip>
                            <Tooltip title="Bearbeiten">
                            <IconButton color="primary" onClick={() => handleOpenEditDialog(u)} size="small"><EditIcon /></IconButton>
                            </Tooltip>
                            <Tooltip title="Löschen">
                            <IconButton color="error" onClick={() => handleDelete(u.id)} size="small"><DeleteIcon /></IconButton>
                            </Tooltip>
                        </TableCell>
                        </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        )}

        {/* Schwebender (Floating) Button "Weitere 50 Benutzer laden" */}
        {!loading && users.length > 0 && (
            <Box sx={{ position: 'fixed', bottom: 32, left: '50%', transform: 'translateX(-50%)', zIndex: 1000, display: 'flex', gap: 2, alignItems: 'center' }}>
                
                <Tooltip title="Zum Seitenanfang">
                    <IconButton 
                        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                        sx={{ bgcolor: 'background.paper', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', '&:hover': { bgcolor: 'grey.100' } }}
                    >
                        <KeyboardArrowUpIcon />
                    </IconButton>
                </Tooltip>

                {hasMore && (
                    <Button 
                        variant="contained" 
                        color="secondary"
                        size="large"
                        sx={{ borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.25)', fontWeight: 'bold', px: 4, py: 1.5 }}
                        onClick={() => {
                            const nextPage = page + 1;
                            setPage(nextPage);
                            fetchUsers(nextPage);
                        }}
                    >
                        Weitere 50 Benutzer laden
                    </Button>
                )}

                <Tooltip title="Zum Seitenende">
                    <IconButton 
                        onClick={() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })}
                        sx={{ bgcolor: 'background.paper', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', '&:hover': { bgcolor: 'grey.100' } }}
                    >
                        <KeyboardArrowDownIcon />
                    </IconButton>
                </Tooltip>

            </Box>
        )}

        {/* --- Dialog: Edit/Add User --- */}
        <Dialog open={openDialog} onClose={handleCloseDialog} fullWidth maxWidth="sm">
          <DialogTitle>
              {editingUser 
                  ? `Benutzer bearbeiten: ${editingUser.first_name || ''} ${editingUser.last_name || ''}`.trim() 
                  : 'Neuen Benutzer hinzufügen'}
          </DialogTitle>
          <DialogContent>
            {dialogError && <Alert severity="error" sx={{ mb: 2 }}>{dialogError}</Alert>}
            <Grid container spacing={2} sx={{ pt: 1 }}>
              <Grid item xs={12} sm={6}><TextField label="Vorname" fullWidth value={formFirstName} onChange={(e) => setFormFirstName(e.target.value)} /></Grid>
              <Grid item xs={12} sm={6}><TextField label="Nachname" fullWidth value={formLastName} onChange={(e) => setFormLastName(e.target.value)} /></Grid>
              
              <Grid item xs={12}>
                  <TextField 
                    label="Profilbild URL" 
                    fullWidth 
                    value={formProfileImageUrl} 
                    onChange={(e) => setFormProfileImageUrl(e.target.value)} 
                    helperText={!isAssistant ? "Link zu einem öffentlichen Bild (z.B. HTTPS URL)" : ""}
                    InputProps={{
                        readOnly: isAssistant, // Nur lesbar für Assistenz
                    }}
                  />
                </Grid>              
              
              <Grid item xs={12} sm={6}><TextField label="Organisation" fullWidth value={formOrganizationName} onChange={(e) => setFormOrganizationName(e.target.value)} /></Grid>
              <Grid item xs={12} sm={6}><TextField label="Username" fullWidth value={formUsername} onChange={(e) => setFormUsername(e.target.value)} disabled={!!editingUser} /></Grid>
              <Grid item xs={12} sm={6}><TextField label="E-Mail" type="email" fullWidth value={formEmail} onChange={(e) => setFormEmail(e.target.value)} /></Grid>
              <Grid item xs={12} sm={6}><TextField label={editingUser ? 'Neues Passwort (leer lassen)' : 'Passwort'} type="password" fullWidth value={formPassword} onChange={(e) => setFormPassword(e.target.value)} /></Grid>
              
              <Grid item xs={12} sm={6}>
                  <TextField 
                      label="Aktiv bis (Optional)" 
                      type="date" 
                      fullWidth 
                      InputLabelProps={{ shrink: true }} 
                      value={formActiveUntil} 
                      onChange={(e) => setFormActiveUntil(e.target.value)} 
                  />
              </Grid>
              <Grid item xs={12} sm={6}><TextField label="LinkedIn URL (optional)" fullWidth value={formLinkedinUrl} onChange={(e) => setFormLinkedinUrl(e.target.value)} /></Grid>
            </Grid>

            {isAdmin && (
                <TextField select margin="dense" label="Rolle" fullWidth value={formRole} onChange={(e) => setFormRole(e.target.value)} sx={{ mt: 2 }}>
                  {filteredRoleOptions.map((role) => (<MenuItem key={role.name} value={role.name} title={role.description}>{role.name}</MenuItem>))}
                </TextField>
            )}

            {isAdmin && (
              <TextField select margin="dense" label="Business Partner" fullWidth value={formBusinessPartnerId} onChange={(e) => setFormBusinessPartnerId(e.target.value)} sx={{ mt: 2 }} disabled={isAssistant}>
                <MenuItem value=""><em>Kein Business Partner</em></MenuItem>
                {businessPartnerOptions.map((bp) => (<MenuItem key={bp.id} value={bp.id}>{bp.name}</MenuItem>))}
              </TextField>
            )}

            <TextField select margin="dense" label="Mitgliedslevel" fullWidth value={formMembershipLevel} onChange={(e) => setFormMembershipLevel(e.target.value)} sx={{ mt: 2 }} disabled={!formBusinessPartnerId}>
              <MenuItem value=""><em>Kein Level</em></MenuItem>
              {membershipLevels && Object.values(membershipLevels).map((level) => level && (<MenuItem key={level} value={level}>{level}</MenuItem>))}
            </TextField>

            <FormControlLabel control={<Switch checked={formIsActive} onChange={(e) => setFormIsActive(e.target.checked)} color="primary" />} label="Nutzerkonto Aktiv" sx={{ mt: 2 }} />
          </DialogContent>
          <DialogActions>
            <Button onClick={handleCloseDialog}>Abbrechen</Button>
            <Button onClick={handleSubmit}>{editingUser ? 'Speichern' : 'Hinzufügen'}</Button>
          </DialogActions>
        </Dialog>
        
        {/* --- Dialog für Benutzer-Statistiken --- */}
        <Dialog open={statsModalOpen} onClose={handleCloseStats} fullWidth maxWidth="sm">
            <DialogTitle>
                Profil & Statistiken: {selectedUserForStats?.first_name} {selectedUserForStats?.last_name}
            </DialogTitle>
            <DialogContent dividers>
                {statsLoading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>
                ) : userStats ? (
                    <Grid container spacing={3}>
                        <Grid item xs={12} sm={6}>
                            <Paper variant="outlined" sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
                                <CalendarTodayIcon color="primary" />
                                <Box>
                                    <Typography variant="caption" color="text.secondary">Registriert am</Typography>
                                    <Typography variant="body1" fontWeight="bold">
                                        {new Date(userStats.registered_at).toLocaleDateString('de-AT')}
                                    </Typography>
                                </Box>
                            </Paper>
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <Paper variant="outlined" sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
                                <LoginIcon color="primary" />
                                <Box>
                                    <Typography variant="caption" color="text.secondary">Letzter Login</Typography>
                                    <Typography variant="body1" fontWeight="bold">
                                        {userStats.last_login_at ? new Date(userStats.last_login_at).toLocaleString('de-AT') : 'Noch nie'}
                                    </Typography>
                                </Box>
                            </Paper>
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <Paper variant="outlined" sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
                                <EmojiEventsIcon sx={{ color: 'warning.main' }} />
                                <Box>
                                    <Typography variant="caption" color="text.secondary">Community Punkte</Typography>
                                    <Typography variant="body1" fontWeight="bold">{userStats.contribution_score}</Typography>
                                </Box>
                            </Paper>
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <Paper variant="outlined" sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
                                <DashboardCustomizeIcon color="info" />
                                <Box>
                                    <Typography variant="caption" color="text.secondary">Installierte Widgets</Typography>
                                    <Typography variant="body1" fontWeight="bold">{userStats.total_widgets}</Typography>
                                </Box>
                            </Paper>
                        </Grid>
                        
                        <Grid item xs={12}>
                            <Typography variant="subtitle2" sx={{ mb: 1, mt: 1 }}>Übersicht der genutzten Widgets</Typography>
                            <Paper variant="outlined">
                                {!userStats.installed_widgets || userStats.installed_widgets.length === 0 ? (
                                    <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: 'center' }}>
                                        Dieser Nutzer hat noch keine Widgets konfiguriert.
                                    </Typography>
                                ) : (
                                    <List dense disablePadding>
                                        {(userStats.installed_widgets || []).map((widget, index) => (
                                            <React.Fragment key={widget.type_key}>
                                                <ListItem>
                                                    <ListItemText 
                                                        primary={widget.widget_name} 
                                                        secondary={widget.type_key} 
                                                    />
                                                    <Chip label={`${widget.count}x`} size="small" />
                                                </ListItem>
                                                {index < userStats.installed_widgets.length - 1 && <Divider />}
                                            </React.Fragment>
                                        ))}
                                    </List>
                                )}
                            </Paper>
                        </Grid>
                    </Grid>
                ) : (
                    <Alert severity="error">Statistiken konnten nicht geladen werden.</Alert>
                )}
            </DialogContent>
            <DialogActions>
                {userStats?.linkedin_url && (
                    <Button 
                        startIcon={<LinkedInIcon />} 
                        href={userStats.linkedin_url} 
                        target="_blank" 
                        sx={{ mr: 'auto' }}
                    >
                        LinkedIn Profil
                    </Button>
                )}
                <Button onClick={handleCloseStats}>Schließen</Button>
            </DialogActions>
        </Dialog>

        {/* --- Dialog: CSV Import --- */}
        <Dialog open={openImportDialog} onClose={() => setOpenImportDialog(false)} fullWidth maxWidth="sm">
          <DialogTitle>Benutzer importieren</DialogTitle>
          <DialogContent>
            <Typography gutterBottom>Importieren (Aktualisieren oder Erstellen) von Benutzern per CSV.<br />- <strong>Bestehende Benutzer</strong> (Abgleich per E-Mail) werden aktualisiert.<br />- <strong>Neue Benutzer</strong> werden erstellt.</Typography>
            <Typography gutterBottom variant="body2" sx={{ mt: 2 }}><strong>Neu: </strong><code>is_active</code> (true/false) und <code>active_until</code> (z.B. YYYY-MM-DD).</Typography>
            <Typography gutterBottom variant="body2" sx={{ mt: 1 }}><strong>Pflichtfelder:</strong> <code>email</code>, <code>role</code>.<br /><strong>Pflichtfeld (neu):</strong> <code>password</code>.<br /><strong>Optionale Felder:</strong> <code>username</code>, <code>first_name</code>, <code>last_name</code>, <code>organization_name</code>, <code>linkedin_url</code>, <code>membership_level</code>, <code>business_partner_name</code>.</Typography>
            
            <Box sx={{ mt: 1 }}><Button onClick={handleDownloadTemplate} size="small">Vorlage herunterladen</Button></Box>        
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
                  <Box component="ul" sx={{ pl: 2 }}>
                    {importReport.errors.map((e: string, i: number) => (
                      <li key={i}><Typography variant="body2" color="error">{e}</Typography></li>
                    ))}
                  </Box>
                )}
              </Box>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => { setOpenImportDialog(false); setImportReport(null); setSelectedFile(null); }}>Schließen</Button>
            <Button onClick={handleImport} disabled={!selectedFile || importing}>{importing ? 'Importiere...' : 'Import starten'}</Button>
          </DialogActions>
        </Dialog>

        <Snackbar open={snackbar.open} autoHideDuration={6000} onClose={() => setSnackbar({ ...snackbar, open: false })} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
          <Alert onClose={() => setSnackbar({ ...snackbar, open: false })} severity={snackbar.severity} sx={{ width: '100%' }}>{snackbar.message}</Alert>
        </Snackbar>
      </Container>
  );
};

export default AdminUserManagementPage;