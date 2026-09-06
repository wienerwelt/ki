import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Collapse,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  InputAdornment,
  LinearProgress,
  Link,
  MenuItem,
  Paper,
  Slider,
  Stack,
  Step,
  StepLabel,
  Stepper,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import RadarIcon from '@mui/icons-material/Radar';
import BusinessCenterIcon from '@mui/icons-material/BusinessCenter';
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import HistoryIcon from '@mui/icons-material/History';
import LinkedInIcon from '@mui/icons-material/LinkedIn';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment';
import EditNoteIcon from '@mui/icons-material/EditNote';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import PhoneInTalkIcon from '@mui/icons-material/PhoneInTalk';
import RefreshIcon from '@mui/icons-material/Refresh';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import ScheduleIcon from '@mui/icons-material/Schedule';
import SearchIcon from '@mui/icons-material/Search';
import TrackChangesIcon from '@mui/icons-material/TrackChanges';
import VideocamOutlinedIcon from '@mui/icons-material/VideocamOutlined';
import VisibilityIcon from '@mui/icons-material/Visibility';
import posthog from 'posthog-js';
import apiClient from '../apiClient';
import { useAuth } from '../context/AuthContext';
import AccountRadarTools, { SalesEntitlements } from '../components/AccountRadarTools';
import AccountRadarAnalytics from '../components/AccountRadarAnalytics';
import AccountDetailDialog from '../components/AccountDetailDialog';
import { resolveAssetUrl } from '../utils/assetUrl';

type SignalStatus = 'new' | 'read' | 'done' | 'ignored';
type SignalActionType = 'contact_planned' | 'follow_up';
type SalesStage = 'contacted' | 'meeting' | 'offer' | 'won' | 'lost';
type ContactChannel = 'email' | 'phone' | 'linkedin' | 'video_call' | 'in_person' | 'contact_form' | 'other';
type RadarPriority = 'low' | 'normal' | 'high' | 'urgent';
type RelevanceReason = 'false_positive' | 'outdated' | 'duplicate' | 'wrong_account' | 'no_sales_relevance' | 'other';
type WorkflowMode = SignalActionType | 'note';
type RadarView = 'today' | 'accounts' | 'planned' | 'done' | 'ignored';

interface RadarSignal {
  id: string;
  account_id?: string;
  article_title: string;
  article_url: string;
  source_name?: string | null;
  source_domain?: string | null;
  published_at: string;
  competitor_name?: string | null;
  summary?: string | null;
  signal_type?: string;
  recommended_action?: string;
  relevance_score?: number;
  status?: SignalStatus;
  action_type?: SignalActionType | null;
  follow_up_at?: string | null;
  workflow_note?: string | null;
  action_updated_at?: string | null;
  task_id?: string | null;
  task_status?: 'open' | 'done' | null;
  completed_at?: string | null;
  campaign_ids?: string[];
  assigned_user_id?: string | null;
  assigned_user_name?: string | null;
  assigned_user_profile_image_url?: string | null;
  contact_id?: string | null;
  contact_channel?: ContactChannel | null;
  contact_name?: string | null;
  contact_job_title?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  owner_user_id?: string | null;
  owner_user_name?: string | null;
  owner_profile_image_url?: string | null;
  contact_linkedin_url?: string | null;
  sales_stage?: SalesStage | null;
  sales_stage_updated_at?: string | null;
  priority?: RadarPriority;
  opportunity_value_eur?: number | null;
  opportunity_probability?: number | null;
  first_contact_at?: string | null;
  relevance_status?: 'relevant' | 'irrelevant' | null;
  relevance_reason?: RelevanceReason | null;
  relevance_note?: string | null;
  days_old?: number;
  type?: 'account' | 'competitor';
  account_name?: string;
  account_logo_url?: string | null;
  account_logo_source?: string | null;
  account_website_url?: string | null;
  account_contact_email?: string | null;
  account_contact_phone?: string | null;
}

interface RadarTeamMember {
  id: string;
  name: string;
  email?: string | null;
  role: 'admin' | 'assistenz' | 'sales_manager' | 'sales_user';
  profile_image_url?: string | null;
}

interface RadarActivity {
  id: string;
  event_type: 'created' | 'updated' | 'assigned' | 'stage_changed' | 'completed' | 'reopened' | 'cancelled';
  event_data?: {
    action_type?: SignalActionType | null;
    follow_up_at?: string | null;
    assigned_user_id?: string | null;
    assigned_user_name?: string | null;
    contact_id?: string | null;
    contact_name?: string | null;
    contact_channel?: ContactChannel | null;
    note_changed?: boolean;
    task_status?: string;
    sales_stage?: SalesStage | null;
    priority?: RadarPriority;
    opportunity_value_eur?: number | null;
    opportunity_probability?: number | null;
  };
  created_at: string;
  actor_user_id?: string | null;
  actor_name: string;
  actor_profile_image_url?: string | null;
}

interface RadarAccount {
  id: string;
  name: string;
  account_status?: string | null;
  website_url?: string | null;
  linkedin_url?: string | null;
  logo_url?: string | null;
  logo_source?: string | null;
  address?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  owner_user_id?: string | null;
  owner_user_name?: string | null;
  owner_profile_image_url?: string | null;
  contacts?: RadarContact[];
  regions?: Array<{ id: string; name: string }>;
  categories?: Array<{ id: string; name: string }>;
  competitors?: Array<{
    id: string;
    name: string;
    website_url?: string | null;
    linkedin_url?: string | null;
    notes?: string | null;
  }>;
  open_signal_count?: number;
  period_open_signal_count?: number;
  account_news: RadarSignal[];
  competitor_news: RadarSignal[];
}

interface RadarCampaign {
  id: string;
  name: string;
  objective?: string | null;
  status: 'draft' | 'active' | 'completed' | 'archived';
  starts_on?: string | null;
  ends_on?: string | null;
  owner_user_id?: string | null;
  owner_user_name?: string | null;
  owner_user_email?: string | null;
  owner_profile_image_url?: string | null;
  account_ids: string[];
  signal_ids: string[];
  account_count: number;
  signal_count: number;
  open_task_count: number;
  planned_count: number;
  overdue_count: number;
  done_count: number;
  contacted_count: number;
  meeting_count: number;
  offer_count: number;
  won_count: number;
  open_pipeline_value_eur: number;
  weighted_pipeline_value_eur: number;
  target_accounts?: number | null;
  target_contacts?: number | null;
  target_meetings?: number | null;
  target_offers?: number | null;
  target_wins?: number | null;
  target_pipeline_eur?: number | null;
}

interface RadarCampaignDetail {
  campaign: RadarCampaign;
  periodDays: number;
  generatedAt: string;
  isSampled?: boolean;
  metrics: {
    accounts: number;
    signals: number;
    contacts: number;
    meetings: number;
    offers: number;
    wins: number;
    losses: number;
    openPipelineValueEur: number;
    weightedPipelineValueEur: number;
  };
  timeline: Array<{ date: string; signals: number; contacts: number; meetings: number; offers: number; wins: number }>;
  accounts: Array<{ id: string; name: string; logo_url?: string | null; signal_count: number; open_task_count: number; won_count: number }>;
}

type RadarCompetitor = NonNullable<RadarAccount['competitors']>[number];

interface CompetitorDetailSelection {
  account: RadarAccount;
  competitor: RadarCompetitor;
  signal?: RadarSignal | null;
}

interface RadarContact {
  id: string;
  name: string;
  job_title?: string | null;
  email?: string | null;
  phone?: string | null;
  linkedin_url?: string | null;
  is_primary?: boolean;
}

const statusLabels: Record<SignalStatus, string> = {
  new: 'Neu',
  read: 'Gelesen',
  done: 'Erledigt',
  ignored: 'Ausgeblendet',
};

const accountStatusLabels: Record<string, string> = {
  prospect: 'Interessent',
  active_customer: 'Kunde',
  churned: 'Ehemalig',
};

const salesStageLabels: Record<SalesStage, string> = {
  contacted: 'Kontaktiert',
  meeting: 'Termin vereinbart',
  offer: 'Angebot',
  won: 'Gewonnen',
  lost: 'Verloren',
};

const contactChannelLabels: Record<ContactChannel, string> = {
  email: 'E-Mail',
  phone: 'Telefon',
  linkedin: 'LinkedIn',
  video_call: 'Video-Call',
  in_person: 'Persönlich',
  contact_form: 'Kontaktformular',
  other: 'Sonstiger Kanal',
};
const priorityLabels: Record<RadarPriority, string> = { low: 'Niedrig', normal: 'Normal', high: 'Hoch', urgent: 'Dringend' };
const priorityValues: RadarPriority[] = ['low', 'normal', 'high', 'urgent'];
const campaignStatusLabels: Record<RadarCampaign['status'], string> = {
  draft: 'Entwurf', active: 'Aktiv', completed: 'Abgeschlossen', archived: 'Archiviert',
};
const relevanceReasonLabels: Record<RelevanceReason, string> = {
  false_positive: 'Falscher Treffer', outdated: 'Veraltet', duplicate: 'Doppelter Treffer',
  wrong_account: 'Falscher Account', no_sales_relevance: 'Keine Vertriebsrelevanz', other: 'Sonstiger Grund',
};
const opportunityFormatter = new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

const campaignProgress = (actual: number, target?: number | null) => {
  const normalizedTarget = Number(target || 0);
  if (normalizedTarget <= 0) return null;
  return Math.min(100, Math.round((Number(actual || 0) / normalizedTarget) * 100));
};

const getCampaignGoalRows = (campaign: RadarCampaign) => ([
  { key: 'accounts', label: 'Accounts', actual: Number(campaign.account_count || 0), target: campaign.target_accounts, money: false },
  { key: 'contacts', label: 'Kontakte', actual: Number(campaign.contacted_count || 0), target: campaign.target_contacts, money: false },
  { key: 'meetings', label: 'Termine', actual: Number(campaign.meeting_count || 0), target: campaign.target_meetings, money: false },
  { key: 'offers', label: 'Angebote', actual: Number(campaign.offer_count || 0), target: campaign.target_offers, money: false },
  { key: 'wins', label: 'Abschlüsse', actual: Number(campaign.won_count || 0), target: campaign.target_wins, money: false },
  { key: 'pipeline', label: 'Pipeline', actual: Number(campaign.open_pipeline_value_eur || 0), target: campaign.target_pipeline_eur, money: true },
]);

const getCampaignCompletion = (campaign: RadarCampaign) => {
  const configured = getCampaignGoalRows(campaign)
    .map((goal) => campaignProgress(goal.actual, goal.target))
    .filter((value): value is number => value !== null);
  return configured.length ? Math.round(configured.reduce((sum, value) => sum + value, 0) / configured.length) : null;
};

const getCampaignDetailGoals = (detail: RadarCampaignDetail) => ([
  { key: 'accounts', label: 'Accounts', actual: Number(detail.metrics.accounts || 0), target: detail.campaign.target_accounts, money: false },
  { key: 'contacts', label: 'Kontakte', actual: Number(detail.metrics.contacts || 0), target: detail.campaign.target_contacts, money: false },
  { key: 'meetings', label: 'Termine', actual: Number(detail.metrics.meetings || 0), target: detail.campaign.target_meetings, money: false },
  { key: 'offers', label: 'Angebote', actual: Number(detail.metrics.offers || 0), target: detail.campaign.target_offers, money: false },
  { key: 'wins', label: 'Abschlüsse', actual: Number(detail.metrics.wins || 0), target: detail.campaign.target_wins, money: false },
  { key: 'pipeline', label: 'Offene Pipeline', actual: Number(detail.metrics.openPipelineValueEur || 0), target: detail.campaign.target_pipeline_eur, money: true },
]);

const calculateAccountQuality = (account: RadarAccount) => {
  const checks = [
    Boolean(account.website_url),
    Boolean(account.logo_url),
    Boolean(account.address),
    Boolean(account.contact_email || account.contact_phone),
    Boolean(account.owner_user_id),
    (account.contacts || []).length > 0,
    (account.regions || []).length > 0,
    (account.categories || []).length > 0,
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
};

const getSignalStatus = (signal: RadarSignal): SignalStatus => signal.status || 'new';

const getDaysOld = (dateString?: string) => {
  if (!dateString) return 999;
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return 999;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((today.getTime() - date.getTime()) / 86_400_000));
};

const formatDate = (dateString?: string) => {
  if (!dateString) return 'Datum unbekannt';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return 'Datum unbekannt';
  return date.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const formatActionDate = (dateString?: string | null) => {
  if (!dateString) return 'Kein Termin';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return 'Kein Termin';
  return date.toLocaleString('de-AT', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatSubscriptionSummary = (dateString?: string | null) => {
  if (!dateString) return 'Abo ohne Enddatum';
  const normalizedDate = String(dateString).slice(0, 10);
  const endDate = /^\d{4}-\d{2}-\d{2}$/.test(normalizedDate)
    ? new Date(`${normalizedDate}T12:00:00`)
    : new Date(dateString);
  if (Number.isNaN(endDate.getTime())) return 'Abo-Laufzeit ansehen';

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const comparisonDate = new Date(endDate);
  comparisonDate.setHours(0, 0, 0, 0);
  const daysRemaining = Math.ceil((comparisonDate.getTime() - today.getTime()) / 86_400_000);
  const formattedDate = endDate.toLocaleDateString('de-AT');
  if (daysRemaining < 0) return `Abo abgelaufen am ${formattedDate}`;
  if (daysRemaining === 0) return `Abo bis ${formattedDate} (endet heute)`;
  return `Abo bis ${formattedDate} (noch ${daysRemaining} ${daysRemaining === 1 ? 'Tag' : 'Tage'})`;
};

const formatTimeUntilAction = (dateString?: string | null, now = Date.now()) => {
  if (!dateString) return null;
  const target = new Date(dateString).getTime();
  if (Number.isNaN(target)) return null;
  const difference = target - now;
  const absoluteMinutes = Math.max(0, Math.round(Math.abs(difference) / 60_000));
  if (absoluteMinutes < 1) return difference >= 0 ? 'Jetzt fällig' : 'Gerade fällig geworden';

  const days = Math.floor(absoluteMinutes / (24 * 60));
  const hours = Math.floor((absoluteMinutes % (24 * 60)) / 60);
  const minutes = absoluteMinutes % 60;
  const parts = [
    days > 0 ? `${days} ${days === 1 ? 'Tag' : 'Tage'}` : null,
    hours > 0 ? `${hours} Std.` : null,
    days === 0 && minutes > 0 ? `${minutes} Min.` : null,
  ].filter(Boolean).slice(0, 2).join(' ');

  return difference >= 0 ? `Noch ${parts}` : `Seit ${parts} fällig`;
};

const toLocalDateTimeValue = (date: Date) => {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
};

const toLocalDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getDefaultActionDate = (actionType: SignalActionType) => {
  const date = new Date();
  date.setDate(date.getDate() + (actionType === 'contact_planned' ? 1 : 7));
  date.setHours(9, 0, 0, 0);
  return toLocalDateTimeValue(date);
};

const isOpenSignal = (signal: RadarSignal) => ['new', 'read'].includes(getSignalStatus(signal));
const isFuturePlannedSignal = (signal: RadarSignal) => (
  isOpenSignal(signal)
  && Boolean(signal.action_type && signal.follow_up_at)
  && new Date(signal.follow_up_at as string).getTime() > Date.now()
);

const getDomain = (url?: string | null) => {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url.replace(/^https?:\/\//i, '').split('/')[0];
  }
};

const getSafeExternalUrl = (value?: string | null) => {
  try {
    const parsed = new URL(String(value || ''));
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : null;
  } catch {
    return null;
  }
};

const inferContactChannel = (contact?: RadarContact | null, account?: RadarAccount | null): ContactChannel | '' => {
  if (contact?.email || account?.contact_email) return 'email';
  if (contact?.phone || account?.contact_phone) return 'phone';
  if (contact?.linkedin_url) return 'linkedin';
  if (account?.website_url) return 'contact_form';
  return '';
};

const getContactChannelIcon = (channel?: ContactChannel | null) => {
  if (channel === 'email') return <EmailOutlinedIcon fontSize="small" />;
  if (channel === 'phone') return <PhoneInTalkIcon fontSize="small" />;
  if (channel === 'linkedin') return <LinkedInIcon fontSize="small" />;
  if (channel === 'video_call') return <VideocamOutlinedIcon fontSize="small" />;
  if (channel === 'in_person') return <PlaceOutlinedIcon fontSize="small" />;
  return <PersonOutlineIcon fontSize="small" />;
};

const getContactActionUrl = (signal: RadarSignal) => {
  if (signal.contact_channel === 'email') {
    const email = signal.contact_email || signal.account_contact_email;
    return email ? `mailto:${email}` : null;
  }
  if (signal.contact_channel === 'phone') {
    const phone = signal.contact_phone || signal.account_contact_phone;
    const safePhone = String(phone || '').replace(/[^+\d*#]/g, '');
    return safePhone ? `tel:${safePhone}` : null;
  }
  if (signal.contact_channel === 'linkedin') return getSafeExternalUrl(signal.contact_linkedin_url);
  if (signal.contact_channel === 'contact_form') return getSafeExternalUrl(signal.account_website_url);
  return null;
};

const escapeIcsText = (value?: string | null) => String(value || '')
  .replace(/\\/g, '\\\\')
  .replace(/\r?\n/g, '\\n')
  .replace(/,/g, '\\,')
  .replace(/;/g, '\\;');

const formatIcsTimestamp = (date: Date) => date.toISOString()
  .replace(/[-:]/g, '')
  .replace(/\.\d{3}Z$/, 'Z');

const createCalendarFile = (signal: RadarSignal) => {
  const start = new Date(signal.follow_up_at || '');
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start.getTime() + 30 * 60_000);
  const actionLabel = signal.action_type === 'follow_up' ? 'Wiedervorlage' : 'Kontakt';
  const summary = `${actionLabel}: ${signal.account_name || 'Account'}`;
  const description = [
    signal.article_title,
    signal.assigned_user_name ? `Verantwortlich: ${signal.assigned_user_name}` : null,
    signal.contact_name ? `Ansprechpartner: ${signal.contact_name}${signal.contact_job_title ? ` (${signal.contact_job_title})` : ''}` : null,
    signal.contact_channel ? `Kontaktkanal: ${contactChannelLabels[signal.contact_channel]}` : null,
    signal.workflow_note,
    signal.recommended_action ? `Empfehlung: ${signal.recommended_action}` : null,
    signal.article_url ? `Quelle: ${signal.article_url}` : null,
  ].filter(Boolean).join('\n\n');
  const contents = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Mobiliti//Account Radar//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:account-radar-${signal.id}@mobiliti.at`,
    `DTSTAMP:${formatIcsTimestamp(new Date())}`,
    `DTSTART:${formatIcsTimestamp(start)}`,
    `DTEND:${formatIcsTimestamp(end)}`,
    `SUMMARY:${escapeIcsText(summary)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    signal.article_url ? `URL:${signal.article_url}` : null,
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean).join('\r\n');
  const safeAccountName = String(signal.account_name || 'Account')
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'Account';
  return new File([`\uFEFF${contents}\r\n`], `Account-Radar-${safeAccountName}.ics`, {
    type: 'text/calendar;charset=utf-8',
  });
};

const AccountRadarPage: React.FC = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, businessPartner } = useAuth();
  const [accounts, setAccounts] = useState<RadarAccount[]>([]);
  const [entitlements, setEntitlements] = useState<SalesEntitlements | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<RadarView>('today');
  const [search, setSearch] = useState('');
  const [days, setDays] = useState(30);
  const [assigneeFilter, setAssigneeFilter] = useState('all');
  const [salesStageFilter, setSalesStageFilter] = useState<SalesStage | 'all'>('all');
  const [campaigns, setCampaigns] = useState<RadarCampaign[]>([]);
  const [campaignFilter, setCampaignFilter] = useState('all');
  const [campaignDialogOpen, setCampaignDialogOpen] = useState(false);
  const [campaignDetailId, setCampaignDetailId] = useState<string | null>(null);
  const [campaignDetail, setCampaignDetail] = useState<RadarCampaignDetail | null>(null);
  const [campaignDetailPeriod, setCampaignDetailPeriod] = useState(30);
  const [campaignDetailLoading, setCampaignDetailLoading] = useState(false);
  const [campaignDetailError, setCampaignDetailError] = useState<string | null>(null);
  const [campaignAccountSearch, setCampaignAccountSearch] = useState('');
  const [editingCampaignId, setEditingCampaignId] = useState<string | null>(null);
  const [campaignForm, setCampaignForm] = useState({
    name: '', objective: '', status: 'draft' as RadarCampaign['status'], starts_on: '', ends_on: '',
    owner_user_id: '', account_ids: [] as string[], target_accounts: '', target_contacts: '',
    target_meetings: '', target_offers: '', target_wins: '', target_pipeline_eur: '',
  });
  const [campaignSaving, setCampaignSaving] = useState(false);
  const [workflowCampaignIds, setWorkflowCampaignIds] = useState<string[]>([]);
  const [workflowSignal, setWorkflowSignal] = useState<RadarSignal | null>(null);
  const [workflowType, setWorkflowType] = useState<WorkflowMode>('contact_planned');
  const [workflowAt, setWorkflowAt] = useState('');
  const [workflowNote, setWorkflowNote] = useState('');
  const [workflowSaving, setWorkflowSaving] = useState(false);
  const [workflowAssigneeId, setWorkflowAssigneeId] = useState('');
  const [workflowSalesStage, setWorkflowSalesStage] = useState<SalesStage | ''>('');
  const [workflowContactId, setWorkflowContactId] = useState('');
  const [workflowContactChannel, setWorkflowContactChannel] = useState<ContactChannel | ''>('');
  const [workflowPriority, setWorkflowPriority] = useState<RadarPriority>('normal');
  const [workflowOpportunityValue, setWorkflowOpportunityValue] = useState('');
  const [workflowOpportunityProbability, setWorkflowOpportunityProbability] = useState('');
  const [ideaApplied, setIdeaApplied] = useState(false);
  const [relevanceSignal, setRelevanceSignal] = useState<RadarSignal | null>(null);
  const [relevanceReason, setRelevanceReason] = useState<RelevanceReason | ''>('');
  const [relevanceNote, setRelevanceNote] = useState('');
  const [relevanceSaving, setRelevanceSaving] = useState(false);
  const [teamMembers, setTeamMembers] = useState<RadarTeamMember[]>([]);
  const [activitySignal, setActivitySignal] = useState<RadarSignal | null>(null);
  const [activityItems, setActivityItems] = useState<RadarActivity[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [detailAccountId, setDetailAccountId] = useState<string | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [competitorDetail, setCompetitorDetail] = useState<CompetitorDetailSelection | null>(null);
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [calendarMonth, setCalendarMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [calendarSelectedDate, setCalendarSelectedDate] = useState(() => toLocalDateKey(new Date()));
  const [calendarFeedOpen, setCalendarFeedOpen] = useState(false);
  const [calendarFeed, setCalendarFeed] = useState<{ enabled: boolean; url: string | null; updated_at?: string | null } | null>(null);
  const [calendarFeedLoading, setCalendarFeedLoading] = useState(false);
  const [cockpitOpen, setCockpitOpen] = useState(true);
  const [calendarOpen, setCalendarOpen] = useState(true);
  const resultsSectionRef = useRef<HTMLDivElement | null>(null);
  const workflowNoteRef = useRef<HTMLDivElement | null>(null);
  const calendarSectionRef = useRef<HTMLDivElement | null>(null);

  const canManageAccounts = ['admin', 'assistenz', 'sales_manager'].includes(String(user?.role || '').toLowerCase());
  const canConfigureRadar = canManageAccounts;
  const isDemoMode = user?.role === 'demo';
  const primary = theme.palette.primary.main;

  useEffect(() => {
    const timer = window.setInterval(() => setClockNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const requestedView = searchParams.get('view');
    if (requestedView && ['today', 'accounts', 'planned', 'done', 'ignored'].includes(requestedView)) {
      setView(requestedView as RadarView);
    }
  }, [searchParams]);

  const requestedToolsPanel = canConfigureRadar && ['import', 'settings'].includes(searchParams.get('panel') || '')
    ? searchParams.get('panel') as 'import' | 'settings'
    : null;
  const clearRequestedToolsPanel = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.delete('panel');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const fetchRadar = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const [radarResponse, teamResponse, entitlementResponse, campaignResponse] = await Promise.all([
        apiClient.get<RadarAccount[]>('/api/data/account-intelligence', { params: { limitPerGroup: 50, periodDays: days } }),
        apiClient.get<RadarTeamMember[]>('/api/data/account-intelligence/team'),
        apiClient.get<SalesEntitlements>('/api/account-radar/entitlements'),
        apiClient.get<RadarCampaign[]>('/api/account-radar/campaigns'),
      ]);
      if (entitlementResponse.res.ok) setEntitlements(entitlementResponse.data);
      if (!radarResponse.res.ok) throw new Error((radarResponse.data as any)?.message || 'Account-Radar konnte nicht geladen werden.');
      setAccounts(Array.isArray(radarResponse.data) ? radarResponse.data : []);
      if (teamResponse.res.ok) setTeamMembers(Array.isArray(teamResponse.data) ? teamResponse.data : []);
      if (campaignResponse.res.ok) setCampaigns(Array.isArray(campaignResponse.data) ? campaignResponse.data : []);
    } catch (err: any) {
      setError(err?.message || 'Account-Radar konnte nicht geladen werden.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [days]);

  useEffect(() => {
    fetchRadar(false);
  }, [fetchRadar]);

  useEffect(() => {
    if (!campaignDetailId) return undefined;
    let active = true;
    setCampaignDetailLoading(true);
    setCampaignDetailError(null);
    apiClient.get<RadarCampaignDetail>(`/api/account-radar/campaigns/${campaignDetailId}/detail`, { params: { periodDays: campaignDetailPeriod } })
      .then((response) => {
        if (!active) return;
        if (!response.res.ok) throw new Error((response.data as any)?.message || 'Kampagnendetails konnten nicht geladen werden.');
        setCampaignDetail(response.data);
      })
      .catch((detailError: any) => {
        if (active) setCampaignDetailError(detailError?.message || 'Kampagnendetails konnten nicht geladen werden.');
      })
      .finally(() => {
        if (active) setCampaignDetailLoading(false);
      });
    return () => { active = false; };
  }, [campaignDetailId, campaignDetailPeriod]);

  const signals = useMemo(() => accounts.flatMap((account) => [
    ...(account.account_news || []).map((signal) => ({
      ...signal,
      type: 'account' as const,
      account_name: account.name,
      account_logo_url: account.logo_url,
      account_logo_source: account.logo_source,
      account_website_url: account.website_url,
      account_contact_email: account.contact_email,
      account_contact_phone: account.contact_phone,
    })),
    ...(account.competitor_news || []).map((signal) => ({
      ...signal,
      type: 'competitor' as const,
      account_name: account.name,
      account_logo_url: account.logo_url,
      account_logo_source: account.logo_source,
      account_website_url: account.website_url,
      account_contact_email: account.contact_email,
      account_contact_phone: account.contact_phone,
    })),
  ]), [accounts]);

  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id === selectedAccountId) || null,
    [accounts, selectedAccountId]
  );
  const selectedCampaign = useMemo(
    () => campaigns.find((campaign) => campaign.id === campaignFilter) || null,
    [campaignFilter, campaigns]
  );
  const selectedCampaignAccountIds = useMemo(() => new Set(selectedCampaign?.account_ids || []), [selectedCampaign]);
  const selectedCampaignSignalIds = useMemo(() => new Set(selectedCampaign?.signal_ids || []), [selectedCampaign]);
  const cockpitAccounts = useMemo(
    () => selectedAccount
      ? [selectedAccount]
      : selectedCampaign
        ? accounts.filter((account) => selectedCampaignAccountIds.has(account.id)
          || signals.some((signal) => signal.account_id === account.id && selectedCampaignSignalIds.has(signal.id)))
        : accounts,
    [accounts, selectedAccount, selectedCampaign, selectedCampaignAccountIds, selectedCampaignSignalIds, signals]
  );
  const cockpitSignals = useMemo(
    () => selectedAccount
      ? signals.filter((signal) => signal.account_id === selectedAccount.id)
      : selectedCampaign
        ? signals.filter((signal) => selectedCampaignSignalIds.has(signal.id) || selectedCampaignAccountIds.has(signal.account_id || ''))
        : signals,
    [selectedAccount, selectedCampaign, selectedCampaignAccountIds, selectedCampaignSignalIds, signals]
  );

  const stats = useMemo(() => {
    const dueSignals = signals.filter((signal) => isOpenSignal(signal) && !isFuturePlannedSignal(signal));
    return {
      accounts: accounts.length,
      open: dueSignals.length,
      new: dueSignals.filter((signal) => getSignalStatus(signal) === 'new').length,
      high: dueSignals.filter((signal) => (signal.relevance_score || 0) >= 80).length,
      planned: signals.filter((signal) => isOpenSignal(signal) && signal.action_type && signal.follow_up_at).length,
      done: signals.filter((signal) => getSignalStatus(signal) === 'done').length,
    };
  }, [accounts.length, signals]);

  const salesOverview = useMemo(() => {
    const due = cockpitSignals.filter((signal) => isOpenSignal(signal) && !isFuturePlannedSignal(signal));
    const waiting = cockpitSignals.filter(isFuturePlannedSignal);
    const done = cockpitSignals.filter((signal) => getSignalStatus(signal) === 'done');
    const workload = due.length + waiting.length + done.length;
    const accountMap = new Map<string, {
      id?: string;
      name: string;
      logoUrl?: string | null;
      logoSource?: string | null;
      due: number;
      waiting: number;
      period: number;
      hot: number;
      total: number;
    }>();

    cockpitAccounts.forEach((account) => {
      const loadedOpenSignals = cockpitSignals.filter((signal) => signal.account_id === account.id && isOpenSignal(signal));
      const total = Number(account.open_signal_count ?? loadedOpenSignals.length);
      if (total <= 0) return;
      accountMap.set(account.name, {
        id: account.id,
        name: account.name,
        logoUrl: account.logo_url,
        logoSource: account.logo_source,
        due: 0,
        waiting: 0,
        period: Number(account.period_open_signal_count ?? loadedOpenSignals.filter((signal) => {
          const signalDays = signal.days_old ?? getDaysOld(signal.published_at);
          return !isFuturePlannedSignal(signal) && signalDays <= days;
        }).length),
        hot: 0,
        total,
      });
    });

    cockpitSignals.forEach((signal) => {
      if (!isOpenSignal(signal)) return;
      const name = signal.account_name || 'Account';
      const item = accountMap.get(name) || {
        id: signal.account_id,
        name,
        logoUrl: signal.account_logo_url,
        logoSource: signal.account_logo_source,
        due: 0,
        waiting: 0,
        period: 0,
        hot: 0,
        total: 0,
      };
      const waitingForDate = isFuturePlannedSignal(signal);
      if (waitingForDate) item.waiting += 1;
      else {
        item.due += 1;
      }
      if (!waitingForDate && (signal.relevance_score || 0) >= 80) item.hot += 1;
      accountMap.set(name, item);
    });

    const topAccounts = Array.from(accountMap.values())
      .sort((a, b) => b.hot - a.hot || b.due - a.due || b.total - a.total || a.name.localeCompare(b.name, 'de'))
      .slice(0, 5);

    return {
      due: due.length,
      waiting: waiting.length,
      done: done.length,
      workload,
      completion: workload > 0 ? Math.round((done.length / workload) * 100) : 0,
      topAccounts,
      maxAccountSignals: Math.max(1, ...topAccounts.map((account) => account.total)),
    };
  }, [cockpitAccounts, cockpitSignals, days]);

  const cockpitCounts = useMemo(() => {
    const current = cockpitSignals.filter((signal) => {
      const signalDays = signal.days_old ?? getDaysOld(signal.published_at);
      return isOpenSignal(signal) && !isFuturePlannedSignal(signal) && signalDays <= days;
    });
    return {
      today: current.length,
      planned: cockpitSignals.filter((signal) => isFuturePlannedSignal(signal)).length,
      done: cockpitSignals.filter((signal) => getSignalStatus(signal) === 'done').length,
      ignored: cockpitSignals.filter((signal) => getSignalStatus(signal) === 'ignored').length,
      new: current.filter((signal) => getSignalStatus(signal) === 'new').length,
      high: current.filter((signal) => (signal.relevance_score || 0) >= 80).length,
    };
  }, [cockpitSignals, days]);

  const cockpitDataQuality = useMemo(() => {
    if (!cockpitAccounts.length) return 0;
    return Math.round(cockpitAccounts.reduce((sum, account) => sum + calculateAccountQuality(account), 0) / cockpitAccounts.length);
  }, [cockpitAccounts]);

  const calendarEntries = useMemo(() => cockpitSignals
    .filter((signal) => signal.action_type && signal.follow_up_at && signal.task_status !== null)
    .map((signal) => {
      const eventDate = signal.task_status === 'done' && signal.completed_at
        ? signal.completed_at
        : signal.follow_up_at!;
      const eventTime = new Date(eventDate).getTime();
      return {
        ...signal,
        eventDate,
        dateKey: toLocalDateKey(new Date(eventDate)),
        calendarStatus: signal.task_status === 'done'
          ? 'done' as const
          : eventTime < clockNow ? 'overdue' as const : 'planned' as const,
      };
    })
    .sort((a, b) => new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime()), [cockpitSignals, clockNow]);

  const calendarDays = useMemo(() => {
    const first = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
    const mondayOffset = (first.getDay() + 6) % 7;
    const start = new Date(first);
    start.setDate(first.getDate() - mondayOffset);
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      const dateKey = toLocalDateKey(date);
      return {
        date,
        dateKey,
        inMonth: date.getMonth() === calendarMonth.getMonth(),
        entries: calendarEntries.filter((entry) => entry.dateKey === dateKey),
      };
    });
  }, [calendarEntries, calendarMonth]);

  const selectedCalendarEntries = useMemo(
    () => calendarEntries.filter((entry) => entry.dateKey === calendarSelectedDate),
    [calendarEntries, calendarSelectedDate]
  );

  const baseFilteredSignals = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('de');
    return signals.filter((signal) => {
        const matchesCampaign = !selectedCampaign
          || selectedCampaignSignalIds.has(signal.id)
          || selectedCampaignAccountIds.has(signal.account_id || '');
        const matchesAssignee = assigneeFilter === 'all'
          || (assigneeFilter === 'unassigned' ? !signal.assigned_user_id : signal.assigned_user_id === assigneeFilter);
        const haystack = [signal.account_name, signal.competitor_name, signal.article_title, signal.summary, signal.source_name, signal.workflow_note, signal.contact_name, signal.contact_job_title]
          .filter(Boolean)
          .join(' ')
          .toLocaleLowerCase('de');
        return matchesCampaign && matchesAssignee && (!query || haystack.includes(query));
      });
  }, [assigneeFilter, search, selectedCampaign, selectedCampaignAccountIds, selectedCampaignSignalIds, signals]);

  const scopedSignals = useMemo(
    () => baseFilteredSignals.filter((signal) => salesStageFilter === 'all' || signal.sales_stage === salesStageFilter),
    [baseFilteredSignals, salesStageFilter]
  );

  const matchesView = useCallback((signal: RadarSignal, targetView: RadarView) => {
    const status = getSignalStatus(signal);
    if (targetView === 'done') return status === 'done';
    if (targetView === 'ignored') return status === 'ignored';
    if (targetView === 'planned') return isFuturePlannedSignal(signal);
    if (targetView === 'accounts') return true;
    const signalDays = signal.days_old ?? getDaysOld(signal.published_at);
    return isOpenSignal(signal) && !isFuturePlannedSignal(signal) && signalDays <= days;
  }, [days]);

  const visibleSignals = useMemo(() => scopedSignals
      .filter((signal) => matchesView(signal, view))
      .sort((a, b) => {
        if (view === 'planned') {
          return new Date(a.follow_up_at || 0).getTime() - new Date(b.follow_up_at || 0).getTime();
        }
        if (view !== 'done') {
          const relevanceDiff = (b.relevance_score || 0) - (a.relevance_score || 0);
          if (relevanceDiff !== 0) return relevanceDiff;
        }
        return new Date(b.published_at).getTime() - new Date(a.published_at).getTime();
      }), [matchesView, scopedSignals, view]);

  const tabCounts = useMemo(() => ({
    today: scopedSignals.filter((signal) => matchesView(signal, 'today')).length,
    planned: scopedSignals.filter((signal) => matchesView(signal, 'planned')).length,
    done: scopedSignals.filter((signal) => matchesView(signal, 'done')).length,
    ignored: scopedSignals.filter((signal) => matchesView(signal, 'ignored')).length,
  }), [matchesView, scopedSignals]);

  const funnelContextView: RadarView = view === 'accounts' ? 'today' : view;
  const cockpitBaseFilteredSignals = useMemo(
    () => selectedAccount
      ? cockpitSignals
      : baseFilteredSignals,
    [baseFilteredSignals, cockpitSignals, selectedAccount]
  );

  const funnelStageCounts = useMemo(
    () => (Object.keys(salesStageLabels) as SalesStage[]).reduce<Record<SalesStage, number>>((result, stage) => {
      result[stage] = cockpitBaseFilteredSignals.filter((signal) => (
        signal.sales_stage === stage && matchesView(signal, funnelContextView)
      )).length;
      return result;
    }, { contacted: 0, meeting: 0, offer: 0, won: 0, lost: 0 }),
    [cockpitBaseFilteredSignals, funnelContextView, matchesView]
  );

  const updateStatus = async (signal: RadarSignal, status: SignalStatus) => {
    const signalId = signal.id;
    setSavingId(signalId);
    const previous = accounts;
    setAccounts((current) => current.map((account) => ({
      ...account,
      account_news: (account.account_news || []).map((signal) => signal.id === signalId ? { ...signal, status } : signal),
      competitor_news: (account.competitor_news || []).map((signal) => signal.id === signalId ? { ...signal, status } : signal),
    })));

    try {
      const sharedTaskTransition = Boolean(signal.task_id && (status === 'done' || (getSignalStatus(signal) === 'done' && status === 'read')));
      const endpoint = sharedTaskTransition
        ? `/api/data/account-intelligence/articles/${signalId}/task-status`
        : `/api/data/account-intelligence/articles/${signalId}/status`;
      const body = sharedTaskTransition
        ? { task_status: status === 'done' ? 'done' : 'open' }
        : { status };
      const { res, data } = await apiClient.request<any>(endpoint, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((data as any)?.message || 'Status konnte nicht gespeichert werden.');
      patchSignal(signalId, {
        status: data?.status || status,
        task_status: data?.task_status || signal.task_status || null,
        sales_stage: Object.prototype.hasOwnProperty.call(data || {}, 'sales_stage') ? (data?.sales_stage || null) : (signal.sales_stage || null),
        sales_stage_updated_at: data?.sales_stage_updated_at || signal.sales_stage_updated_at || null,
        action_updated_at: data?.action_updated_at || signal.action_updated_at || null,
        completed_at: Object.prototype.hasOwnProperty.call(data || {}, 'completed_at') ? (data?.completed_at || null) : (signal.completed_at || null),
      });
      posthog.capture('account_radar_signal_status_updated', { status, shared_task: sharedTaskTransition });
    } catch (err: any) {
      setAccounts(previous);
      setError(err?.message || 'Status konnte nicht gespeichert werden.');
    } finally {
      setSavingId(null);
    }
  };

  const patchSignal = (signalId: string, patch: Partial<RadarSignal>) => {
    setAccounts((current) => current.map((account) => ({
      ...account,
      account_news: (account.account_news || []).map((signal) => signal.id === signalId ? { ...signal, ...patch } : signal),
      competitor_news: (account.competitor_news || []).map((signal) => signal.id === signalId ? { ...signal, ...patch } : signal),
    })));
  };

  const openWorkflow = (signal: RadarSignal, preferredType?: WorkflowMode) => {
    const actionType = preferredType || signal.action_type || 'contact_planned';
    const account = accounts.find((item) => item.id === signal.account_id) || null;
    const primaryContact = (account?.contacts || []).find((contact) => contact.is_primary)
      || (account?.contacts || [])[0]
      || null;
    const contactId = actionType === 'contact_planned'
      ? (signal.contact_id || primaryContact?.id || '')
      : '';
    const selectedContact = (account?.contacts || []).find((contact) => contact.id === contactId) || null;
    setWorkflowSignal(signal);
    setWorkflowType(actionType);
    setWorkflowAt(signal.follow_up_at
      ? toLocalDateTimeValue(new Date(signal.follow_up_at))
      : getDefaultActionDate(actionType === 'note' ? 'contact_planned' : actionType));
    setWorkflowNote(signal.workflow_note || '');
    setWorkflowAssigneeId(signal.assigned_user_id || user?.id || '');
    setWorkflowSalesStage(signal.sales_stage || '');
    setWorkflowPriority(signal.priority || 'normal');
    setWorkflowOpportunityValue(signal.opportunity_value_eur === null || signal.opportunity_value_eur === undefined ? '' : String(signal.opportunity_value_eur));
    setWorkflowOpportunityProbability(signal.opportunity_probability === null || signal.opportunity_probability === undefined ? '' : String(signal.opportunity_probability));
    setWorkflowCampaignIds(campaigns.filter((campaign) => campaign.signal_ids.includes(signal.id)).map((campaign) => campaign.id));
    setIdeaApplied(false);
    setWorkflowContactId(contactId);
    setWorkflowContactChannel(actionType === 'contact_planned'
      ? (signal.contact_channel || inferContactChannel(selectedContact, account))
      : '');
  };

  const changeWorkflowType = (actionType: WorkflowMode) => {
    setWorkflowType(actionType);
    if (actionType !== 'note' && !workflowSignal?.follow_up_at) setWorkflowAt(getDefaultActionDate(actionType));
    if (actionType !== 'contact_planned') {
      setWorkflowContactId('');
      setWorkflowContactChannel('');
    } else if (!workflowContactChannel) {
      const account = accounts.find((item) => item.id === workflowSignal?.account_id) || null;
      const selectedContact = (account?.contacts || []).find((contact) => contact.id === workflowContactId) || null;
      setWorkflowContactChannel(inferContactChannel(selectedContact, account));
    }
  };

  const saveWorkflow = async (clearPlanning = false) => {
    if (!workflowSignal || workflowSaving) return;
    const hasPlanning = !clearPlanning && workflowType !== 'note';
    if (hasPlanning && !workflowAt) {
      setError('Bitte einen Termin für die Radar-Aktion auswählen.');
      return;
    }
    if (hasPlanning && workflowType === 'contact_planned' && !workflowContactChannel) {
      setError('Bitte einen Kontaktkanal auswählen.');
      return;
    }

    setWorkflowSaving(true);
    try {
      const actionType = hasPlanning ? workflowType : null;
      const followUpAt = hasPlanning ? new Date(workflowAt).toISOString() : null;
      const { res, data } = await apiClient.request<any>(`/api/data/account-intelligence/articles/${workflowSignal.id}/workflow`, {
        method: 'PATCH',
        body: JSON.stringify({
          action_type: actionType,
          follow_up_at: followUpAt,
          note: workflowNote,
          assigned_user_id: workflowAssigneeId || null,
          sales_stage: workflowSalesStage || null,
          priority: workflowPriority,
          opportunity_value_eur: workflowOpportunityValue === '' ? null : Number(workflowOpportunityValue),
          opportunity_probability: workflowOpportunityProbability === '' ? null : Number(workflowOpportunityProbability),
          contact_id: hasPlanning && workflowType === 'contact_planned' ? (workflowContactId || null) : null,
          contact_channel: hasPlanning && workflowType === 'contact_planned' ? (workflowContactChannel || null) : null,
        }),
      });
      if (!res.ok) throw new Error(data?.message || 'Radar-Aktion konnte nicht gespeichert werden.');
      patchSignal(workflowSignal.id, {
        status: data?.status || 'read',
        action_type: data?.action_type || null,
        follow_up_at: data?.follow_up_at || null,
        workflow_note: data?.workflow_note || null,
        action_updated_at: data?.action_updated_at || null,
        task_id: data?.task_id || null,
        task_status: data?.task_status || null,
        assigned_user_id: data?.assigned_user_id || null,
        assigned_user_name: data?.assigned_user_name || null,
        assigned_user_profile_image_url: data?.assigned_user_profile_image_url || null,
        contact_id: data?.contact_id || null,
        contact_channel: data?.contact_channel || null,
        contact_name: data?.contact_name || null,
        contact_job_title: data?.contact_job_title || null,
        contact_email: data?.contact_email || null,
        contact_phone: data?.contact_phone || null,
        contact_linkedin_url: data?.contact_linkedin_url || null,
        sales_stage: data?.sales_stage || null,
        sales_stage_updated_at: data?.sales_stage_updated_at || null,
        priority: data?.priority || 'normal',
        opportunity_value_eur: data?.opportunity_value_eur ?? null,
        opportunity_probability: data?.opportunity_probability ?? null,
        first_contact_at: data?.first_contact_at || null,
        completed_at: data?.completed_at || null,
      });
      const campaignsSaved = await syncWorkflowCampaigns(workflowSignal.id, workflowCampaignIds);
      posthog.capture('account_radar_workflow_updated', {
        action_type: actionType || 'cleared',
        contact_channel: actionType === 'contact_planned' ? workflowContactChannel : null,
        has_contact: Boolean(actionType === 'contact_planned' && workflowContactId),
      });
      setNotice(!campaignsSaved
        ? 'Radar-Aktion gespeichert; die Kampagnenzuordnung konnte nicht vollständig übernommen werden.'
        : clearPlanning
        ? 'Planung entfernt. Die Notiz bleibt erhalten.'
        : workflowType === 'note' ? 'Notiz gespeichert.' : 'Radar-Aktion gespeichert.');
      if (campaignsSaved) {
        setCampaigns((current) => current.map((campaign) => ({
          ...campaign,
          signal_ids: workflowCampaignIds.includes(campaign.id)
            ? Array.from(new Set([...campaign.signal_ids, workflowSignal.id]))
            : campaign.signal_ids.filter((id) => id !== workflowSignal.id),
        })));
      }
      setWorkflowSignal(null);
    } catch (err: any) {
      setError(err?.message || 'Radar-Aktion konnte nicht gespeichert werden.');
    } finally {
      setWorkflowSaving(false);
    }
  };

  const openRelevanceDialog = (signal: RadarSignal) => {
    setRelevanceSignal(signal);
    setRelevanceReason(signal.relevance_reason || 'no_sales_relevance');
    setRelevanceNote(signal.relevance_note || '');
  };

  const saveRelevance = async (relevanceStatus: 'relevant' | 'irrelevant', targetSignal = relevanceSignal) => {
    if (!targetSignal || relevanceSaving) return;
    if (relevanceStatus === 'irrelevant' && !relevanceReason) {
      setError('Bitte einen Grund auswählen.');
      return;
    }
    setRelevanceSaving(true);
    try {
      const { res, data } = await apiClient.request<any>(`/api/data/account-intelligence/articles/${targetSignal.id}/relevance`, {
        method: 'PATCH',
        body: JSON.stringify({
          relevance_status: relevanceStatus,
          reason: relevanceStatus === 'irrelevant' ? relevanceReason : null,
          note: relevanceNote,
        }),
      });
      if (!res.ok) throw new Error(data?.message || 'Relevanzbewertung konnte nicht gespeichert werden.');
      patchSignal(targetSignal.id, {
        status: data?.status || (relevanceStatus === 'irrelevant' ? 'ignored' : 'read'),
        relevance_status: data?.relevance_status || relevanceStatus,
        relevance_reason: data?.relevance_reason || null,
        relevance_note: data?.relevance_note || null,
      });
      setNotice(relevanceStatus === 'irrelevant' ? 'Treffer ausgeblendet und Qualitätsgrund gespeichert.' : 'Signal wieder als relevant markiert.');
      setRelevanceSignal(null);
    } catch (requestError: any) {
      setError(requestError?.message || 'Relevanzbewertung konnte nicht gespeichert werden.');
    } finally {
      setRelevanceSaving(false);
    }
  };

  const openSignal = (signal: RadarSignal) => {
    const sourceUrl = getSafeExternalUrl(signal.article_url);
    if (!sourceUrl) {
      setError('Der Quellenlink ist ungültig oder nicht sicher.');
      return;
    }
    if (!isDemoMode && getSignalStatus(signal) === 'new') updateStatus(signal, 'read');
    posthog.capture('account_radar_signal_opened', {
      signal_type: signal.type || 'account',
      relevance_band: (signal.relevance_score || 0) >= 80 ? 'high' : (signal.relevance_score || 0) >= 60 ? 'medium' : 'low',
    });
    window.open(sourceUrl, '_blank', 'noopener,noreferrer');
  };

  const openActivity = async (signal: RadarSignal) => {
    setActivitySignal(signal);
    setActivityItems([]);
    setActivityLoading(true);
    try {
      const { res, data } = await apiClient.get<RadarActivity[]>(`/api/data/account-intelligence/articles/${signal.id}/activity`);
      if (!res.ok) throw new Error((data as any)?.message || 'Aktivitätsverlauf konnte nicht geladen werden.');
      setActivityItems(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err?.message || 'Aktivitätsverlauf konnte nicht geladen werden.');
      setActivitySignal(null);
    } finally {
      setActivityLoading(false);
    }
  };

  const shareCalendarEntry = async (signal: RadarSignal) => {
    const file = createCalendarFile(signal);
    if (!file) {
      setError('Der geplante Termin ist ungültig und kann nicht exportiert werden.');
      return;
    }

    const shareData: ShareData = {
      title: `Account-Radar: ${signal.account_name || 'Kontakt'}`,
      text: `${signal.action_type === 'follow_up' ? 'Wiedervorlage' : 'Kontakt'} am ${formatActionDate(signal.follow_up_at)}`,
      files: [file],
    };

    try {
      if (navigator.share && navigator.canShare?.(shareData)) {
        await navigator.share(shareData);
        posthog.capture('account_radar_calendar_shared', { method: 'native' });
        setNotice('Kalendertermin geteilt.');
        return;
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
    }

    const objectUrl = URL.createObjectURL(file);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = file.name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
    posthog.capture('account_radar_calendar_shared', { method: 'download' });
    setNotice('Kalenderdatei heruntergeladen. Sie kann per Mail oder Messenger geteilt werden.');
  };

  const showSignalInCalendar = (signal: RadarSignal) => {
    if (!signal.follow_up_at) return;
    const eventDate = new Date(signal.task_status === 'done' && signal.completed_at ? signal.completed_at : signal.follow_up_at);
    if (Number.isNaN(eventDate.getTime())) return;
    setCalendarMonth(new Date(eventDate.getFullYear(), eventDate.getMonth(), 1));
    setCalendarSelectedDate(toLocalDateKey(eventDate));
    setCalendarOpen(true);
    window.setTimeout(() => calendarSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  };

  const openTopAccount = (account: { id?: string; name: string }) => {
    setSelectedAccountId(account.id || accounts.find((item) => item.name === account.name)?.id || null);
    setSearch(account.name);
    setAssigneeFilter('all');
    setSalesStageFilter('all');
    setView('accounts');
    window.setTimeout(() => {
      resultsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  };

  const openAccountDetails = (accountId?: string | null) => {
    if (!accountId) return;
    setSelectedAccountId(accountId);
    setDetailAccountId(accountId);
  };

  const openCompetitorDetails = (account: RadarAccount, competitor: RadarCompetitor, signal?: RadarSignal | null) => {
    setSelectedAccountId(account.id);
    setCompetitorDetail({
      account,
      competitor,
      signal: signal ? {
        ...signal,
        type: 'competitor',
        account_id: account.id,
        account_name: account.name,
        account_logo_url: account.logo_url,
        account_logo_source: account.logo_source,
      } : null,
    });
  };

  const openSignalCompetitor = (signal: RadarSignal) => {
    const account = accounts.find((item) => item.id === signal.account_id);
    if (!account || !signal.competitor_name) return;
    const competitor = (account.competitors || []).find((item) => item.name.trim().toLocaleLowerCase('de') === signal.competitor_name?.trim().toLocaleLowerCase('de'))
      || { id: `signal-${signal.id}`, name: signal.competitor_name };
    openCompetitorDetails(account, competitor, signal);
  };

  const goToAccountManagement = () => {
    if (user?.business_partner_id) navigate(`/admin/business-partners/${user.business_partner_id}/accounts`);
    else navigate('/admin/business-partners');
  };

  const renderSignal = (signal: RadarSignal) => {
    const status = getSignalStatus(signal);
    const competitorSignal = signal.type === 'competitor';
    const score = signal.relevance_score || 0;
    const source = signal.source_name || signal.source_domain || getDomain(signal.article_url) || 'Quelle';
    const saving = savingId === signal.id;
    const contactActionUrl = getContactActionUrl(signal);

    return (
      <Paper
        key={signal.id}
        elevation={0}
        sx={{
          p: { xs: 2, md: 2.5 },
          borderRadius: 4,
          border: '1px solid',
          borderColor: status === 'new' ? alpha(primary, 0.38) : 'divider',
          bgcolor: status === 'new' ? alpha(primary, 0.035) : 'background.paper',
          opacity: saving ? 0.62 : 1,
          transition: 'opacity 160ms ease, border-color 160ms ease',
        }}
      >
        <Stack direction="row" spacing={1.5} alignItems="flex-start">
          <Box sx={{ width: 42, height: 42, flexShrink: 0, borderRadius: 2.5, display: 'grid', placeItems: 'center', color: competitorSignal ? 'secondary.main' : 'primary.main', bgcolor: competitorSignal ? alpha(theme.palette.secondary.main, 0.12) : alpha(primary, 0.11) }}>
            {competitorSignal ? <TrackChangesIcon /> : <BusinessCenterIcon />}
          </Box>
          <Box sx={{ minWidth: 0, flexGrow: 1 }}>
            <Stack direction="row" alignItems="center" spacing={0.8} flexWrap="wrap" useFlexGap>
              <Button
                variant="text"
                size="small"
                onClick={() => openAccountDetails(signal.account_id)}
                sx={{ minWidth: 0, p: 0, color: 'text.primary', fontWeight: 950, lineHeight: 1.2, textTransform: 'none' }}
              >
                {signal.account_name}
              </Button>
              {signal.competitor_name && <Chip clickable size="small" label={`Wettbewerb: ${signal.competitor_name}`} variant="outlined" color="secondary" onClick={() => openSignalCompetitor(signal)} sx={{ height: 24, fontWeight: 800 }} />}
              <Chip size="small" label={statusLabels[status]} color={status === 'new' ? 'primary' : status === 'done' ? 'success' : 'default'} sx={{ height: 22, fontWeight: 850 }} />
              {campaigns.filter((campaign) => campaign.signal_ids.includes(signal.id) || campaign.account_ids.includes(signal.account_id || '')).map((campaign) => (
                <Chip key={campaign.id} size="small" icon={<CampaignOutlinedIcon />} label={campaign.name} variant="outlined" color="info" sx={{ height: 24, fontWeight: 800 }} />
              ))}
            </Stack>

            <Typography variant="h6" sx={{ mt: 1, fontWeight: 900, lineHeight: 1.25, fontSize: { xs: '1.05rem', md: '1.15rem' } }}>
              {signal.article_title}
            </Typography>

            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
              <Chip size="small" icon={<LocalFireDepartmentIcon />} label={`${score}% relevant`} color={score >= 80 ? 'error' : 'default'} variant={score >= 80 ? 'filled' : 'outlined'} sx={{ fontWeight: 900 }} />
              <Chip size="small" label={signal.signal_type || (competitorSignal ? 'Wettbewerbssignal' : 'Account-Signal')} variant="outlined" sx={{ fontWeight: 800 }} />
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>{source} · {formatDate(signal.published_at)}</Typography>
            </Stack>

            {signal.summary && (
              <Box sx={{ mt: 1.5 }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Warum relevant?</Typography>
                <Typography variant="body2" sx={{ mt: 0.35, lineHeight: 1.55 }}>{signal.summary}</Typography>
              </Box>
            )}

            {signal.recommended_action && (
              <Box sx={{ mt: 1.5, p: 1.4, borderRadius: 2.5, bgcolor: alpha(theme.palette.success.main, 0.08), border: `1px solid ${alpha(theme.palette.success.main, 0.18)}` }}>
                <Typography variant="caption" sx={{ display: 'block', color: 'success.dark', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Nächster Schritt</Typography>
                <Typography variant="body2" sx={{ mt: 0.25, fontWeight: 750 }}>{signal.recommended_action}</Typography>
              </Box>
            )}

            {(signal.action_type || signal.workflow_note || signal.sales_stage || signal.opportunity_value_eur !== null && signal.opportunity_value_eur !== undefined || signal.priority && signal.priority !== 'normal') && (
              <Box
                sx={{
                  mt: 1.5,
                  p: 1.4,
                  borderRadius: 2.5,
                  bgcolor: alpha(theme.palette.info.main, 0.08),
                  border: `1px solid ${alpha(theme.palette.info.main, 0.2)}`,
                }}
              >
                <Stack direction="row" spacing={1} alignItems="flex-start">
                  <Box sx={{ color: 'info.main', display: 'flex', mt: 0.15 }}>
                    {signal.action_type === 'contact_planned'
                      ? <PhoneInTalkIcon fontSize="small" />
                      : signal.action_type === 'follow_up' ? <ScheduleIcon fontSize="small" /> : <BusinessCenterIcon fontSize="small" />}
                  </Box>
                  <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                    {signal.action_type && signal.follow_up_at ? (
                      <Button
                        onClick={() => showSignalInCalendar(signal)}
                        title="Termin im Kontaktkalender anzeigen"
                        sx={{ display: 'block', minWidth: 0, p: 0, textAlign: 'left', textTransform: 'none', color: 'inherit' }}
                      >
                        <Typography variant="caption" sx={{ display: 'block', color: 'info.dark', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          {signal.action_type === 'contact_planned' ? 'Kontakt geplant' : 'Wiedervorlage'}
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 850 }}>
                          {formatActionDate(signal.follow_up_at)}
                        </Typography>
                        {formatTimeUntilAction(signal.follow_up_at, clockNow) && (
                          <Typography
                            variant="caption"
                            sx={{
                              display: 'block',
                              mt: 0.15,
                              color: new Date(signal.follow_up_at || 0).getTime() < clockNow ? 'error.main' : 'info.dark',
                              fontWeight: 850,
                            }}
                          >
                            {formatTimeUntilAction(signal.follow_up_at, clockNow)}
                          </Typography>
                        )}
                      </Button>
                    ) : (
                      <Typography variant="caption" sx={{ display: 'block', color: 'info.dark', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {signal.sales_stage ? 'Vertriebsstatus' : 'Team-Notiz'}
                      </Typography>
                    )}
                    {signal.assigned_user_name && (
                      <Chip
                        size="small"
                        avatar={<Avatar src={signal.assigned_user_profile_image_url || undefined}>{signal.assigned_user_name.slice(0, 1)}</Avatar>}
                        label={`Verantwortlich: ${signal.assigned_user_name}`}
                        sx={{ mt: 0.65, maxWidth: '100%', fontWeight: 800 }}
                      />
                    )}
                    {signal.contact_name && (
                      <Chip
                        size="small"
                        icon={<PersonOutlineIcon />}
                        label={`${signal.contact_name}${signal.contact_job_title ? ` · ${signal.contact_job_title}` : ''}`}
                        variant="outlined"
                        sx={{ mt: 0.65, ml: signal.assigned_user_name ? 0.65 : 0, maxWidth: '100%', fontWeight: 800 }}
                      />
                    )}
                    {signal.contact_channel && (
                      <Chip
                        size="small"
                        icon={getContactChannelIcon(signal.contact_channel)}
                        label={contactChannelLabels[signal.contact_channel]}
                        variant="outlined"
                        sx={{ mt: 0.65, ml: (signal.assigned_user_name || signal.contact_name) ? 0.65 : 0, fontWeight: 800 }}
                      />
                    )}
                    {signal.sales_stage && (
                      <Chip
                        size="small"
                        label={salesStageLabels[signal.sales_stage]}
                        color={signal.sales_stage === 'won' ? 'success' : signal.sales_stage === 'lost' ? 'error' : signal.sales_stage === 'offer' ? 'warning' : 'primary'}
                        sx={{ mt: 0.65, ml: signal.assigned_user_name ? 0.65 : 0, fontWeight: 900 }}
                      />
                    )}
                    {signal.priority && signal.priority !== 'normal' && (
                      <Chip size="small" label={`Priorität: ${priorityLabels[signal.priority]}`} color={signal.priority === 'urgent' ? 'error' : 'warning'} sx={{ mt: 0.65, ml: 0.65, fontWeight: 900 }} />
                    )}
                    {signal.opportunity_value_eur !== null && signal.opportunity_value_eur !== undefined && (
                      <Chip size="small" label={`${opportunityFormatter.format(Number(signal.opportunity_value_eur))} · ${signal.opportunity_probability ?? 0}%`} variant="outlined" color="success" sx={{ mt: 0.65, ml: 0.65, fontWeight: 900 }} />
                    )}
                    {signal.relevance_status === 'irrelevant' && signal.relevance_reason && (
                      <Chip size="small" label={relevanceReasonLabels[signal.relevance_reason]} variant="outlined" sx={{ mt: 0.65, ml: 0.65 }} />
                    )}
                    {signal.workflow_note && (
                      <Box
                        sx={{
                          mt: 0.8,
                          p: 1,
                          borderRadius: 2,
                          bgcolor: alpha(theme.palette.secondary.main, 0.08),
                          borderLeft: `3px solid ${theme.palette.secondary.main}`,
                        }}
                      >
                        <Stack direction="row" spacing={0.6} alignItems="center">
                          <LockOutlinedIcon sx={{ fontSize: 15, color: 'secondary.main' }} />
                          <Typography variant="caption" sx={{ color: 'secondary.main', fontWeight: 900 }}>Interne Notiz · nur im Radar</Typography>
                        </Stack>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.35, overflowWrap: 'anywhere' }}>
                          {signal.workflow_note}
                        </Typography>
                      </Box>
                    )}
                    {(signal.action_type && signal.follow_up_at) || signal.task_id ? (
                      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 0.7, alignItems: { xs: 'stretch', sm: 'center' } }}>
                        {signal.action_type && signal.follow_up_at && (
                          <Button
                            size="small"
                            variant="text"
                            startIcon={<EventAvailableIcon />}
                            onClick={() => shareCalendarEntry(signal)}
                            sx={{ px: 0, minWidth: 0, justifyContent: 'flex-start', fontWeight: 850, textTransform: 'none', whiteSpace: 'normal', lineHeight: 1.2 }}
                          >
                            Kalenderdatei teilen
                          </Button>
                        )}
                        {signal.task_id && (
                          <Button
                            size="small"
                            variant="text"
                            startIcon={<HistoryIcon />}
                            onClick={() => openActivity(signal)}
                            sx={{ px: 0, minWidth: 0, justifyContent: 'flex-start', fontWeight: 850, textTransform: 'none', whiteSpace: 'normal', lineHeight: 1.2 }}
                          >
                            Verlauf
                          </Button>
                        )}
                        {contactActionUrl && signal.action_type === 'contact_planned' && (
                          <Button
                            size="small"
                            variant="text"
                            component="a"
                            href={contactActionUrl}
                            target={contactActionUrl.startsWith('http') ? '_blank' : undefined}
                            rel={contactActionUrl.startsWith('http') ? 'noopener noreferrer' : undefined}
                            startIcon={getContactChannelIcon(signal.contact_channel)}
                            sx={{ px: 0, minWidth: 0, justifyContent: 'flex-start', fontWeight: 850, textTransform: 'none' }}
                          >
                            Kontakt öffnen
                          </Button>
                        )}
                      </Stack>
                    ) : null}
                  </Box>
                  {!isDemoMode && (
                    <Tooltip title="Planung oder Notiz bearbeiten">
                      <IconButton size="small" onClick={() => openWorkflow(signal)} aria-label="Planung bearbeiten">
                        <EditNoteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                </Stack>
              </Box>
            )}

            <Box sx={{
              mt: 1.8,
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))', lg: 'repeat(6, max-content)' },
              gap: 1,
              '& .MuiButton-root': {
                minWidth: 0,
                minHeight: 42,
                whiteSpace: 'normal',
                lineHeight: 1.15,
                overflowWrap: 'anywhere',
              },
              }}>
              <Button size={isMobile ? 'medium' : 'small'} variant="outlined" startIcon={<OpenInNewIcon />} onClick={() => openSignal(signal)} disabled={saving}>Quelle öffnen</Button>
              {!isDemoMode && (
                <>
                  <Button size={isMobile ? 'medium' : 'small'} variant="contained" startIcon={<PhoneInTalkIcon />} onClick={() => openWorkflow(signal, 'contact_planned')} disabled={saving}>Kontakt planen</Button>
                  <Button size={isMobile ? 'medium' : 'small'} variant="outlined" startIcon={<ScheduleIcon />} onClick={() => openWorkflow(signal, 'follow_up')} disabled={saving}>Wiedervorlage</Button>
                  <Button size={isMobile ? 'medium' : 'small'} variant="outlined" startIcon={<EditNoteIcon />} onClick={() => openWorkflow(signal, 'note')} disabled={saving}>Notiz</Button>
                  {status !== 'done' && (
                    <Button size={isMobile ? 'medium' : 'small'} variant="outlined" color="success" startIcon={<DoneAllIcon />} onClick={() => updateStatus(signal, 'done')} disabled={saving}>Erledigt</Button>
                  )}
                  {status === 'done' && (
                    <Button size={isMobile ? 'medium' : 'small'} variant="outlined" startIcon={<VisibilityIcon />} onClick={() => updateStatus(signal, 'read')} disabled={saving}>Wieder öffnen</Button>
                  )}
                  {status === 'ignored' ? (
                    <Button size={isMobile ? 'medium' : 'small'} variant="outlined" onClick={() => saveRelevance('relevant', signal)} disabled={saving || relevanceSaving}>Wieder relevant</Button>
                  ) : (
                    <Button size={isMobile ? 'medium' : 'small'} variant="text" color="inherit" startIcon={<DeleteOutlineIcon />} onClick={() => openRelevanceDialog(signal)} disabled={saving}>Nicht relevant</Button>
                  )}
                </>
              )}
            </Box>
          </Box>
        </Stack>
      </Paper>
    );
  };

  const renderAccounts = () => {
    const query = search.trim().toLocaleLowerCase('de');
    const visibleAccounts = cockpitAccounts.filter((account) => !query || `${account.name} ${(account.competitors || []).map((competitor) => competitor.name).join(' ')}`.toLocaleLowerCase('de').includes(query));

    return (
      <Stack spacing={1.5}>
        {selectedAccount && (
          <Alert
            severity="info"
            action={<Button color="inherit" size="small" onClick={() => { setSelectedAccountId(null); setSearch(''); }}>Auswahl aufheben</Button>}
            sx={{ '& .MuiAlert-message': { minWidth: 0 }, '& .MuiAlert-action': { alignItems: 'center' } }}
          >
            Explizit ausgewählt: <strong>{selectedAccount.name}</strong>. Die Account-Karte ist farblich hervorgehoben.
          </Alert>
        )}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 1.5 }}>
        {visibleAccounts.map((account) => {
          const accountSignals = [...(account.account_news || []), ...(account.competitor_news || [])];
          const open = accountSignals.filter((signal) => ['new', 'read'].includes(getSignalStatus(signal))).length;
          const selected = selectedAccountId === account.id;
          return (
            <Paper
              key={account.id}
              elevation={0}
              sx={{
                p: 2.2,
                borderRadius: 3.5,
                border: selected ? '2px solid' : '1px solid',
                borderColor: selected ? 'primary.main' : 'divider',
                bgcolor: selected ? alpha(primary, 0.055) : 'background.paper',
                boxShadow: selected ? `0 0 0 4px ${alpha(primary, 0.09)}` : 'none',
              }}
            >
              <Stack direction="row" spacing={1.4} alignItems="flex-start">
                <Avatar
                  variant="rounded"
                  src={resolveAssetUrl(account.logo_url) || '/logos/default-company.svg'}
                  alt={`${account.name} Logo`}
                  imgProps={{ onError: (event) => { event.currentTarget.src = '/logos/default-company.svg'; } }}
                  sx={{ width: 48, height: 44, flexShrink: 0, bgcolor: alpha(primary, 0.1), border: '1px solid', borderColor: 'divider', '& img': { objectFit: 'contain', p: 0.45 } }}
                >
                  <BusinessCenterIcon />
                </Avatar>
                <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                  <Stack direction="row" justifyContent="space-between" spacing={1} alignItems="flex-start">
                    <Button size="small" variant="text" onClick={() => openAccountDetails(account.id)} sx={{ minWidth: 0, p: 0, color: 'text.primary', textAlign: 'left', justifyContent: 'flex-start', fontWeight: 950, textTransform: 'none' }}>{account.name}</Button>
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      {selected && <Chip size="small" color="primary" label="Ausgewählt" sx={{ fontWeight: 850 }} />}
                      <Button size="small" variant="text" onClick={() => openAccountDetails(account.id)} sx={{ minWidth: 0, p: 0.3, fontWeight: 850 }}>Details</Button>
                    </Stack>
                  </Stack>
                  {account.owner_user_name && <Chip size="small" avatar={<Avatar src={account.owner_profile_image_url || undefined}>{account.owner_user_name.slice(0, 1)}</Avatar>} label={`Account: ${account.owner_user_name}`} variant="outlined" sx={{ mt: 0.7 }} />}
                  <Stack direction="row" spacing={0.7} flexWrap="wrap" useFlexGap sx={{ mt: 0.8 }}>
                    <Chip size="small" label={accountStatusLabels[account.account_status || ''] || account.account_status || 'Account'} variant="outlined" />
                    <Chip size="small" label={`${open} offen`} color={open > 0 ? 'primary' : 'default'} />
                    <Chip size="small" label={`${accountSignals.length} Signale`} variant="outlined" />
                    <Chip size="small" icon={<PersonOutlineIcon />} label={`${(account.contacts || []).length} Kontakte`} variant="outlined" />
                  </Stack>
                  <Box sx={{ mt: 1.1 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 850 }}>Wettbewerber</Typography>
                    <Stack direction="row" spacing={0.6} useFlexGap flexWrap="wrap" sx={{ mt: 0.5 }}>
                      {(account.competitors || []).slice(0, 3).map((competitor) => {
                        const relatedSignal = (account.competitor_news || []).find((signal) => signal.competitor_name?.trim().toLocaleLowerCase('de') === competitor.name.trim().toLocaleLowerCase('de'));
                        return <Chip key={competitor.id} clickable size="small" label={competitor.name} icon={<TrackChangesIcon />} onClick={() => openCompetitorDetails(account, competitor, relatedSignal)} />;
                      })}
                      {(account.competitors || []).length > 3 && <Chip size="small" variant="outlined" label={`+${(account.competitors || []).length - 3}`} />}
                      {(account.competitors || []).length === 0 && <Typography variant="caption" color="text.secondary">Noch keine Zuordnung</Typography>}
                    </Stack>
                  </Box>
                  {account.website_url && <Link href={account.website_url} target="_blank" rel="noopener noreferrer" sx={{ mt: 1.2, display: 'inline-block', fontSize: '0.82rem', fontWeight: 750 }}>{getDomain(account.website_url)}</Link>}
                </Box>
              </Stack>
            </Paper>
          );
        })}
        </Box>
      </Stack>
    );
  };

  const workflowAccount = workflowSignal
    ? accounts.find((account) => account.id === workflowSignal.account_id) || null
    : null;
  const workflowContacts = workflowAccount?.contacts || [];
  const workflowSelectedContact = workflowContacts.find((contact) => contact.id === workflowContactId) || null;
  const workflowContactEmail = workflowSelectedContact?.email || (!workflowSelectedContact ? workflowAccount?.contact_email : null);
  const workflowContactPhone = workflowSelectedContact?.phone || (!workflowSelectedContact ? workflowAccount?.contact_phone : null);
  const workflowContactLinkedIn = getSafeExternalUrl(workflowSelectedContact?.linkedin_url);
  const workflowActiveStep = workflowType === 'note'
    ? (workflowNote.trim() ? 3 : 1)
    : !workflowAt || (workflowType === 'contact_planned' && !workflowContactChannel)
      ? 1
      : !workflowAssigneeId ? 2 : 3;

  const selectWorkflowContact = (contactId: string) => {
    const selectedContact = workflowContacts.find((contact) => contact.id === contactId) || null;
    setWorkflowContactId(contactId);
    const inferredChannel = inferContactChannel(selectedContact, workflowAccount);
    if (inferredChannel) setWorkflowContactChannel(inferredChannel);
  };

  const openWorkflowContactManagement = () => {
    if (!workflowSignal?.account_id) return;
    setDetailAccountId(workflowSignal.account_id);
    setWorkflowSignal(null);
  };

  const openCampaignDialog = (campaign?: RadarCampaign) => {
    setEditingCampaignId(campaign?.id || null);
    setCampaignForm(campaign ? {
      name: campaign.name,
      objective: campaign.objective || '',
      status: campaign.status,
      starts_on: campaign.starts_on ? String(campaign.starts_on).slice(0, 10) : '',
      ends_on: campaign.ends_on ? String(campaign.ends_on).slice(0, 10) : '',
      owner_user_id: campaign.owner_user_id || '',
      account_ids: campaign.account_ids || [],
      target_accounts: campaign.target_accounts == null ? '' : String(campaign.target_accounts),
      target_contacts: campaign.target_contacts == null ? '' : String(campaign.target_contacts),
      target_meetings: campaign.target_meetings == null ? '' : String(campaign.target_meetings),
      target_offers: campaign.target_offers == null ? '' : String(campaign.target_offers),
      target_wins: campaign.target_wins == null ? '' : String(campaign.target_wins),
      target_pipeline_eur: campaign.target_pipeline_eur == null ? '' : String(campaign.target_pipeline_eur),
    } : {
      name: '', objective: '', status: 'draft', starts_on: '', ends_on: '', owner_user_id: user?.id || '', account_ids: [],
      target_accounts: '', target_contacts: '', target_meetings: '', target_offers: '', target_wins: '', target_pipeline_eur: '',
    });
    setCampaignAccountSearch('');
    setCampaignDialogOpen(true);
  };

  const toggleCampaignAccount = (accountId: string) => {
    setCampaignForm((current) => ({
      ...current,
      account_ids: current.account_ids.includes(accountId)
        ? current.account_ids.filter((id) => id !== accountId)
        : [...current.account_ids, accountId],
    }));
  };

  const saveCampaign = async () => {
    if (campaignSaving || campaignForm.name.trim().length < 2) return;
    setCampaignSaving(true);
    setError(null);
    try {
      const endpoint = editingCampaignId
        ? `/api/account-radar/campaigns/${editingCampaignId}`
        : '/api/account-radar/campaigns';
      const method = editingCampaignId ? 'PUT' : 'POST';
      const campaignResponse = await apiClient.request<RadarCampaign>(endpoint, {
        method,
        body: JSON.stringify({
          name: campaignForm.name.trim(),
          objective: campaignForm.objective.trim() || null,
          status: campaignForm.status,
          starts_on: campaignForm.starts_on || null,
          ends_on: campaignForm.ends_on || null,
          owner_user_id: campaignForm.owner_user_id || null,
          target_accounts: campaignForm.target_accounts || null,
          target_contacts: campaignForm.target_contacts || null,
          target_meetings: campaignForm.target_meetings || null,
          target_offers: campaignForm.target_offers || null,
          target_wins: campaignForm.target_wins || null,
          target_pipeline_eur: campaignForm.target_pipeline_eur || null,
        }),
      });
      if (!campaignResponse.res.ok || !campaignResponse.data?.id) {
        throw new Error((campaignResponse.data as any)?.message || 'Kampagne konnte nicht gespeichert werden.');
      }
      const campaignId = campaignResponse.data.id;
      const existing = campaigns.find((campaign) => campaign.id === campaignId);
      if (campaignForm.status !== 'archived') {
        const assignmentResponse = await apiClient.request(`/api/account-radar/campaigns/${campaignId}/assignments`, {
          method: 'PUT',
          body: JSON.stringify({
            account_ids: campaignForm.account_ids,
            signal_ids: existing?.signal_ids || [],
          }),
        });
        if (!assignmentResponse.res.ok) throw new Error((assignmentResponse.data as any)?.message || 'Kampagnenzuordnung konnte nicht gespeichert werden.');
      }
      setCampaignDialogOpen(false);
      setNotice(editingCampaignId ? 'Kampagne aktualisiert.' : 'Kampagne angelegt.');
      await fetchRadar(true);
    } catch (campaignError: any) {
      setError(campaignError?.message || 'Kampagne konnte nicht gespeichert werden.');
    } finally {
      setCampaignSaving(false);
    }
  };

  const syncWorkflowCampaigns = async (signalId: string, desiredCampaignIds: string[]) => {
    const response = await apiClient.request(`/api/account-radar/campaigns/signals/${signalId}`, {
      method: 'PUT',
      body: JSON.stringify({ campaign_ids: desiredCampaignIds }),
    });
    return response.res.ok;
  };

  const copyWorkflowNote = async () => {
    if (!workflowNote.trim()) return;
    try {
      await navigator.clipboard.writeText(workflowNote);
      setNotice('Gesprächsidee / interne Notiz kopiert.');
    } catch (_) {
      setError('Der Text konnte nicht in die Zwischenablage kopiert werden.');
    }
  };

  const applyConversationIdea = () => {
    if (!workflowSignal?.recommended_action) return;
    setWorkflowNote(workflowSignal.recommended_action);
    setIdeaApplied(true);
    window.setTimeout(() => workflowNoteRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0);
  };

  const openCalendarFeed = async () => {
    setCalendarFeedOpen(true);
    setCalendarFeedLoading(true);
    try {
      const response = await apiClient.get<{ enabled: boolean; url: string | null; updated_at?: string | null }>('/api/account-radar/calendar-feed');
      if (!response.res.ok) throw new Error((response.data as any)?.message || 'Kalenderfeed konnte nicht geladen werden.');
      setCalendarFeed(response.data);
    } catch (feedError: any) {
      setError(feedError?.message || 'Kalenderfeed konnte nicht geladen werden.');
    } finally {
      setCalendarFeedLoading(false);
    }
  };

  const rotateCalendarFeed = async () => {
    setCalendarFeedLoading(true);
    try {
      const response = await apiClient.request<{ enabled: boolean; url: string | null; updated_at?: string | null }>('/api/account-radar/calendar-feed/rotate', { method: 'POST' });
      if (!response.res.ok) throw new Error((response.data as any)?.message || 'Kalenderfeed konnte nicht erstellt werden.');
      setCalendarFeed(response.data);
      setNotice('Neuer Kalenderfeed erstellt. Ein früherer Link ist damit ungültig.');
    } catch (feedError: any) {
      setError(feedError?.message || 'Kalenderfeed konnte nicht erstellt werden.');
    } finally {
      setCalendarFeedLoading(false);
    }
  };

  const disableCalendarFeed = async () => {
    setCalendarFeedLoading(true);
    try {
      const response = await apiClient.request<{ enabled: boolean; url: string | null }>('/api/account-radar/calendar-feed', { method: 'DELETE' });
      if (!response.res.ok) throw new Error((response.data as any)?.message || 'Kalenderfeed konnte nicht deaktiviert werden.');
      setCalendarFeed(response.data);
      setNotice('Kalenderfeed deaktiviert.');
    } catch (feedError: any) {
      setError(feedError?.message || 'Kalenderfeed konnte nicht deaktiviert werden.');
    } finally {
      setCalendarFeedLoading(false);
    }
  };

  const copyCalendarFeed = async () => {
    if (!calendarFeed?.url) return;
    try {
      await navigator.clipboard.writeText(calendarFeed.url);
      setNotice('Kalenderfeed-Link kopiert.');
    } catch (_) {
      setError('Kalenderfeed-Link konnte nicht kopiert werden.');
    }
  };

  const campaignDetailGoals = campaignDetail ? getCampaignDetailGoals(campaignDetail) : [];
  const configuredCampaignDetailGoals = campaignDetailGoals.filter((goal) => Number(goal.target || 0) > 0);
  const campaignDetailFunnel = campaignDetail ? [
    { label: 'Kontakte', value: Number(campaignDetail.metrics.contacts || 0), color: theme.palette.info.main },
    { label: 'Termine', value: Number(campaignDetail.metrics.meetings || 0), color: theme.palette.warning.main },
    { label: 'Angebote', value: Number(campaignDetail.metrics.offers || 0), color: theme.palette.secondary.main },
    { label: 'Gewonnen', value: Number(campaignDetail.metrics.wins || 0), color: theme.palette.success.main },
  ] : [];
  const campaignDetailFunnelMax = Math.max(1, ...campaignDetailFunnel.map((entry) => entry.value));
  const campaignTimelineMax = Math.max(1, ...(campaignDetail?.timeline || []).map((entry) => entry.signals + entry.contacts + entry.meetings + entry.offers + entry.wins));
  const todayLabel = new Date().toLocaleDateString('de-AT', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });

  return (
    <Container maxWidth="xl" sx={{ py: { xs: 2, md: 4 }, pb: { xs: 12, md: 5 } }}>
      <Box sx={{ display: 'flex', alignItems: { xs: 'flex-start', md: 'center' }, justifyContent: 'space-between', gap: 2, flexDirection: { xs: 'column', md: 'row' } }}>
        <Box>
          <Stack direction="row" spacing={1} alignItems="center">
            <RadarIcon sx={{ color: 'primary.main', fontSize: 30 }} />
            <Typography component="h1" variant="h4" sx={{ fontWeight: 950, letterSpacing: '-0.025em' }}>Account-Radar</Typography>
          </Stack>
          <Typography color="text.secondary" sx={{ mt: 0.6, textTransform: 'capitalize' }}>{todayLabel} · {businessPartner?.name || 'Ihr Unternehmen'}</Typography>
          {entitlements && (
            <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
              <Chip size="small" color={entitlements.key === 'premium' ? 'success' : 'default'} label={entitlements.label} />
              <Typography variant="caption" color="text.secondary">
                {entitlements.usage?.accounts || 0} / {entitlements.limits.accounts.toLocaleString('de-DE')} Accounts
              </Typography>
              <Typography variant="caption" color="text.disabled" aria-hidden="true">·</Typography>
              <Link
                component="a"
                href="/account-radar#pakete"
                target="_blank"
                rel="noopener noreferrer"
                variant="caption"
                underline="hover"
                sx={{ fontWeight: 850, textAlign: 'left' }}
              >
                {formatSubscriptionSummary(
                  entitlements.subscription?.status === 'trial'
                    ? entitlements.subscription.trialEndsOn
                    : businessPartner?.subscription_end_date
                )}
              </Link>
            </Stack>
          )}
        </Box>
        <Stack
          direction="row"
          spacing={1}
          flexWrap="wrap"
          useFlexGap
          sx={{
            width: { xs: '100%', md: 'auto' },
            '& > .MuiButton-root': {
              flex: { xs: '1 1 100%', sm: '0 0 auto' },
              minWidth: 0,
              minHeight: 42,
              whiteSpace: 'nowrap',
              lineHeight: 1.2,
            },
          }}
        >
          <Tooltip title={entitlements?.subscription?.accessActive === false ? 'Nach Freischaltung wieder verfügbar' : 'Signale aktualisieren'}><span><IconButton onClick={() => fetchRadar(true)} disabled={refreshing || entitlements?.subscription?.accessActive === false} sx={{ border: '1px solid', borderColor: 'divider' }}><RefreshIcon /></IconButton></span></Tooltip>
          {canConfigureRadar && entitlements?.subscription?.accessActive !== false && (
            <AccountRadarTools
              onImported={() => fetchRadar(true)}
              onManageAccounts={goToAccountManagement}
              onOpenCampaigns={() => openCampaignDialog()}
              onOpenCalendarFeed={openCalendarFeed}
              accountCount={loading ? undefined : accounts.length}
              openPanel={requestedToolsPanel}
              onPanelOpened={clearRequestedToolsPanel}
              entitlements={entitlements}
            />
          )}
        </Stack>
      </Box>

      {refreshing && <LinearProgress sx={{ mt: 2, borderRadius: 99 }} />}
      {error && <Alert severity="error" sx={{ mt: 2 }} onClose={() => setError(null)}>{error}</Alert>}
      {entitlements?.subscription?.status === 'trial' && entitlements.subscription.accessActive && (
        <Alert
          severity="warning"
          sx={{ mt: 2 }}
          action={<Button component="a" href="/account-radar?request=upgrade#pakete" target="_blank" rel="noopener noreferrer" color="inherit">Paket anfragen</Button>}
        >
          <strong>{entitlements.label}-Testphase:</strong> noch {entitlements.subscription.trialDaysRemaining ?? 0} Tage, bis einschließlich {entitlements.subscription.trialEndsOn ? new Date(entitlements.subscription.trialEndsOn).toLocaleDateString('de-AT') : 'Enddatum'}.
        </Alert>
      )}
      {entitlements?.subscription && !entitlements.subscription.accessActive && (
        <Alert
          severity="error"
          sx={{ mt: 2 }}
          action={<Button component="a" href="/account-radar?request=upgrade#pakete" target="_blank" rel="noopener noreferrer" color="inherit">Freischaltung anfragen</Button>}
        >
          {entitlements.subscription.trialExpired ? 'Ihre Account-Radar-Testphase ist abgelaufen.' : 'Der Account-Radar ist für diesen Mandanten pausiert.'} Die Daten bleiben erhalten.
        </Alert>
      )}
      {entitlements?.key === 'basic' && entitlements.subscription?.accessActive && entitlements.subscription.status !== 'trial' && (
        <Alert
          severity="info"
          sx={{
            mt: 2,
            border: '1px solid',
            borderColor: (theme) => alpha(theme.palette.info.main, 0.28),
            background: (theme) => `linear-gradient(120deg, ${alpha(theme.palette.info.main, 0.12)}, ${theme.palette.background.paper})`,
            '& .MuiAlert-message': { width: '100%' },
          }}
        >
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', md: 'center' }} justifyContent="space-between">
            <Typography variant="body2" sx={{ lineHeight: 1.55 }}>
              <strong>Sales Basic ist aktiv.</strong> Premium ergänzt Import, Wettbewerber-Monitoring, häufigere Radar-Mails, Sales-Erfolgsmessung, KI-Sales-Kontext, Management-PDF und die mandantengebundene API.
            </Typography>
            <Button
              component="a"
              href="/account-radar?request=upgrade#pakete"
              target="_blank"
              rel="noopener noreferrer"
              variant="contained"
              color="info"
              endIcon={<OpenInNewIcon />}
              sx={{ flexShrink: 0, minHeight: 40, whiteSpace: 'nowrap', fontWeight: 900 }}
            >
              Sales Premium ansehen
            </Button>
          </Stack>
        </Alert>
      )}

      {campaigns.some((campaign) => campaign.status !== 'archived') && entitlements?.subscription?.accessActive !== false && (
        <Paper
          elevation={0}
          sx={{
            mt: 3,
            p: { xs: 1.5, md: 2.3 },
            borderRadius: 4,
            border: '1px solid',
            borderColor: 'divider',
            background: `linear-gradient(135deg, ${alpha(primary, 0.08)}, ${theme.palette.background.paper} 44%)`,
          }}
        >
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.2} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }}>
            <Box>
              <Stack direction="row" spacing={1} alignItems="center">
                <CampaignOutlinedIcon color="primary" />
                <Typography variant="h6" sx={{ fontWeight: 950 }}>Kampagnen-Cockpit</Typography>
                <Chip
                  size="small"
                  label={`${campaigns.filter((campaign) => campaign.status === 'active').length} aktiv`}
                  color="success"
                  variant="outlined"
                />
              </Stack>
              <Typography variant="caption" color="text.secondary">Ziele, Fortschritt und Handlungsbedarf auf einen Blick vergleichen.</Typography>
            </Box>
            <Stack direction="row" spacing={0.8} useFlexGap flexWrap="wrap">
              <Button
                size="small"
                variant={campaignFilter === 'all' ? 'contained' : 'outlined'}
                onClick={() => { setCampaignFilter('all'); setSelectedAccountId(null); setSearch(''); }}
                sx={{ whiteSpace: 'nowrap' }}
              >
                Gesamtansicht
              </Button>
              {canConfigureRadar && <Button size="small" variant="outlined" onClick={() => openCampaignDialog()}>Kampagnen verwalten</Button>}
            </Stack>
          </Stack>

          <Box sx={{ mt: 1.8, display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(3, minmax(0, 1fr))' }, gap: 1.3 }}>
            {campaigns.filter((campaign) => campaign.status !== 'archived').map((campaign) => {
              const completion = getCampaignCompletion(campaign);
              const configuredGoals = getCampaignGoalRows(campaign).filter((goal) => Number(goal.target || 0) > 0);
              const selected = campaignFilter === campaign.id;
              const statusColor = campaign.status === 'active' ? 'success' : campaign.status === 'completed' ? 'default' : 'warning';
              const responsible = teamMembers.find((member) => member.id === campaign.owner_user_id);
              return (
                <Paper
                  key={campaign.id}
                  variant="outlined"
                  sx={{
                    p: 1.5,
                    borderRadius: 3,
                    minWidth: 0,
                    borderWidth: selected ? 2 : 1,
                    borderColor: selected ? 'primary.main' : 'divider',
                    bgcolor: selected ? alpha(primary, 0.055) : 'background.paper',
                    boxShadow: selected ? `0 8px 24px ${alpha(primary, 0.14)}` : 'none',
                  }}
                >
                  <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="subtitle1" noWrap title={campaign.name} sx={{ fontWeight: 950 }}>{campaign.name}</Typography>
                      <Stack direction="row" spacing={0.6} useFlexGap flexWrap="wrap" sx={{ mt: 0.5 }}>
                        <Chip size="small" color={statusColor} label={campaignStatusLabels[campaign.status]} />
                        {campaign.overdue_count > 0 && <Chip size="small" color="error" variant="outlined" label={`${campaign.overdue_count} überfällig`} />}
                      </Stack>
                    </Box>
                    {completion !== null && (
                      <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
                        <Typography variant="h5" color="primary.main" sx={{ fontWeight: 950, lineHeight: 1 }}>{completion}%</Typography>
                        <Typography variant="caption" color="text.secondary">Zielgrad</Typography>
                      </Box>
                    )}
                  </Stack>

                  {(campaign.owner_user_name || responsible) && (
                    <Stack direction="row" spacing={0.8} alignItems="center" sx={{ mt: 1.2, minWidth: 0 }}>
                      <Avatar src={resolveAssetUrl(campaign.owner_profile_image_url || responsible?.profile_image_url) || undefined} sx={{ width: 27, height: 27, fontSize: '0.72rem' }}>
                        {(campaign.owner_user_name || responsible?.name || 'U').charAt(0).toUpperCase()}
                      </Avatar>
                      <Typography variant="caption" noWrap title={[campaign.owner_user_name || responsible?.name, campaign.owner_user_email || responsible?.email].filter(Boolean).join(' · ')}>
                        {campaign.owner_user_name || responsible?.name}{(campaign.owner_user_email || responsible?.email) ? ` (${campaign.owner_user_email || responsible?.email})` : ''}
                      </Typography>
                    </Stack>
                  )}

                  {configuredGoals.length ? (
                    <Stack spacing={1.05} sx={{ mt: 1.5 }}>
                      {configuredGoals.map((goal) => {
                        const progress = campaignProgress(goal.actual, goal.target) || 0;
                        return (
                          <Box key={goal.key}>
                            <Stack direction="row" justifyContent="space-between" spacing={1}>
                              <Typography variant="caption" sx={{ fontWeight: 850 }}>{goal.label}</Typography>
                              <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                                {goal.money ? opportunityFormatter.format(goal.actual) : goal.actual} / {goal.money ? opportunityFormatter.format(Number(goal.target)) : goal.target}
                              </Typography>
                            </Stack>
                            <LinearProgress
                              variant="determinate"
                              value={progress}
                              color={progress >= 100 ? 'success' : 'primary'}
                              sx={{ mt: 0.35, height: 7, borderRadius: 99, bgcolor: alpha(primary, 0.1) }}
                            />
                          </Box>
                        );
                      })}
                    </Stack>
                  ) : (
                    <Box sx={{ mt: 1.4 }}>
                      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 0.7 }}>
                        {[
                          [campaign.account_count, 'Accounts'],
                          [campaign.contacted_count, 'Kontakte'],
                          [campaign.won_count, 'Gewonnen'],
                        ].map(([value, label]) => (
                          <Box key={String(label)} sx={{ p: 0.8, borderRadius: 2, bgcolor: alpha(theme.palette.text.primary, 0.045), textAlign: 'center', minWidth: 0 }}>
                            <Typography sx={{ fontWeight: 950, lineHeight: 1.1 }}>{value}</Typography>
                            <Typography variant="caption" color="text.secondary" noWrap>{label}</Typography>
                          </Box>
                        ))}
                      </Box>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.9 }}>Noch keine Zielwerte hinterlegt.</Typography>
                    </Box>
                  )}

                  <Box sx={{ mt: 1.5, display: 'grid', gridTemplateColumns: canConfigureRadar ? 'repeat(3, minmax(0, 1fr))' : 'repeat(2, minmax(0, 1fr))', gap: 0.6 }}>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => { setCampaignDetail(null); setCampaignDetailPeriod(30); setCampaignDetailId(campaign.id); }}
                      sx={{ whiteSpace: 'nowrap', minWidth: 0, px: 0.7 }}
                    >
                      Details
                    </Button>
                    <Button
                      size="small"
                      variant={selected ? 'contained' : 'outlined'}
                      onClick={() => { setCampaignFilter(campaign.id); setSelectedAccountId(null); setSearch(''); }}
                      sx={{ whiteSpace: 'nowrap', minWidth: 0, px: 0.7 }}
                    >
                      {selected ? 'Im Fokus' : 'Fokus'}
                    </Button>
                    {canConfigureRadar && (
                      <Button size="small" color="inherit" onClick={() => openCampaignDialog(campaign)} sx={{ whiteSpace: 'nowrap', minWidth: 0, px: 0.7 }}>
                        {configuredGoals.length ? 'Bearbeiten' : 'Ziele'}
                      </Button>
                    )}
                  </Box>
                </Paper>
              );
            })}
          </Box>
        </Paper>
      )}

      {entitlements?.features.advancedAnalytics && entitlements.subscription?.accessActive !== false && (
        <Box sx={{ mt: 3 }}><AccountRadarAnalytics tenantName={businessPartner?.name} /></Box>
      )}

      <Paper
        elevation={0}
        sx={{
          mt: 3,
          p: { xs: 2, md: 2.5 },
          borderRadius: 4,
          border: '1px solid',
          borderColor: 'divider',
          background: `linear-gradient(135deg, ${alpha(primary, 0.075)}, ${theme.palette.background.paper} 48%)`,
        }}
      >
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1.5}>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 950 }}>Sales-Cockpit</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 750 }}>
              {selectedAccount
                ? `Account-Fokus: ${selectedAccount.name} – alle Cockpit-Werte beziehen sich auf diesen Account.`
                : selectedCampaign
                  ? `Kampagnen-Fokus: ${selectedCampaign.name} – Accounts, Signale und Kennzahlen sind entsprechend gefiltert.`
                : 'Gesamtansicht: Was ist jetzt wichtig und wo lohnt sich der nächste Kontakt?'}
              </Typography>
          </Box>
          <Tooltip title={cockpitOpen ? 'Sales-Cockpit einklappen' : 'Sales-Cockpit öffnen'}>
            <IconButton onClick={() => setCockpitOpen((current) => !current)} aria-expanded={cockpitOpen} aria-label="Sales-Cockpit ein- oder ausklappen">
              {cockpitOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </IconButton>
          </Tooltip>
        </Stack>
        <Collapse in={cockpitOpen} timeout="auto">
          <Box sx={{ pt: 1.5 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'stretch', sm: 'center' }}>
            <TextField
              select
              size="small"
              label="Kampagne"
              value={campaignFilter}
              onChange={(event) => {
                setCampaignFilter(event.target.value);
                setSelectedAccountId(null);
                setSearch('');
              }}
              sx={{ minWidth: { xs: '100%', sm: 180 }, '& .MuiOutlinedInput-root': { bgcolor: 'background.paper' } }}
            >
              <MenuItem value="all">Alle Kampagnen</MenuItem>
              {campaigns.filter((campaign) => campaign.status !== 'archived').map((campaign) => (
                <MenuItem key={campaign.id} value={campaign.id}>{campaign.name} · {campaignStatusLabels[campaign.status]}</MenuItem>
              ))}
            </TextField>
            <TextField
              select
              size="small"
              label="Zeitraum"
              value={days}
              onChange={(event) => setDays(Number(event.target.value))}
              sx={{ minWidth: { xs: '100%', sm: 132 }, '& .MuiOutlinedInput-root': { bgcolor: 'background.paper' } }}
            >
              <MenuItem value={7}>7 Tage</MenuItem>
              <MenuItem value={30}>30 Tage</MenuItem>
              <MenuItem value={90}>90 Tage</MenuItem>
              <MenuItem value={365}>1 Jahr</MenuItem>
            </TextField>
            <Chip
              icon={<BusinessCenterIcon />}
              label={selectedAccount
                ? `Account: ${selectedAccount.name}`
                : selectedCampaign
                  ? `${selectedCampaign.name} · ${cockpitAccounts.length} Accounts`
                  : `Gesamt · ${stats.accounts} Accounts`}
              color={selectedAccount ? 'primary' : 'default'}
              variant={selectedAccount ? 'filled' : 'outlined'}
              onDelete={selectedAccount ? () => { setSelectedAccountId(null); setSearch(''); } : undefined}
              sx={{
                fontWeight: 850,
                maxWidth: { xs: '100%', sm: 320 },
                justifyContent: 'flex-start',
                '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis' },
              }}
            />
          </Stack>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1.05fr 1.35fr' }, gap: { xs: 2, md: 3 }, mt: 2.3 }}>
          <Stack direction="row" spacing={1.8} justifyContent="center" alignItems="flex-start" sx={{ py: 0.5 }}>
            {[
              { value: salesOverview.completion, label: 'Arbeitsstand', inside: 'erledigt', color: theme.palette.success.main, action: () => setView('done') },
              { value: cockpitDataQuality, label: 'Datenqualität', inside: 'vollständig', color: cockpitDataQuality >= 75 ? theme.palette.success.main : cockpitDataQuality >= 50 ? theme.palette.warning.main : theme.palette.error.main, action: () => selectedAccount && openAccountDetails(selectedAccount.id) },
            ].map((item) => (
              <Box key={item.label} sx={{ display: 'grid', placeItems: 'center', minWidth: 0 }}>
                <Button
                  onClick={item.action}
                  aria-label={`${item.label}: ${item.value} Prozent`}
                  sx={{ p: 0, minWidth: 0, borderRadius: '50%', textTransform: 'none' }}
                >
                  <Box sx={{ width: { xs: 108, sm: 118 }, height: { xs: 108, sm: 118 }, borderRadius: '50%', display: 'grid', placeItems: 'center', background: `conic-gradient(${item.color} 0 ${item.value}%, ${alpha(theme.palette.text.primary, 0.1)} ${item.value}% 100%)` }}>
                    <Box sx={{ width: { xs: 78, sm: 86 }, height: { xs: 78, sm: 86 }, borderRadius: '50%', bgcolor: 'background.paper', display: 'grid', placeItems: 'center', textAlign: 'center', boxShadow: `0 4px 20px ${alpha(theme.palette.common.black, 0.08)}` }}>
                      <Box>
                        <Typography variant="h5" sx={{ fontWeight: 950, lineHeight: 1 }}>{item.value}%</Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 800, fontSize: '0.65rem' }}>{item.inside}</Typography>
                      </Box>
                    </Box>
                  </Box>
                </Button>
                <Typography variant="caption" sx={{ mt: 1, fontWeight: 900, textAlign: 'center' }}>{item.label}</Typography>
              </Box>
            ))}
          </Stack>

          <Box sx={{ borderLeft: { md: '1px solid' }, borderColor: { md: 'divider' }, pl: { md: 3 } }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 950 }}>Radar-Pipeline · aktueller Filter</Typography>
            <Typography variant="caption" color="text.secondary">
              {selectedAccount ? `Nur Signale von ${selectedAccount.name}. Ein Klick übernimmt den Account-Filter.` : 'Die Werte entsprechen exakt den Tabs darunter.'}
            </Typography>
            <Stack spacing={1.2} sx={{ mt: 1.3 }}>
              {[
                { label: `Aktuell · ${days} Tage`, value: cockpitCounts.today, color: primary, target: 'today' as RadarView },
                { label: 'Geplant', value: cockpitCounts.planned, color: theme.palette.info.main, target: 'planned' as RadarView },
                { label: 'Erledigt', value: cockpitCounts.done, color: theme.palette.success.main, target: 'done' as RadarView },
              ].map((item) => {
                const maxValue = Math.max(1, cockpitCounts.today, cockpitCounts.planned, cockpitCounts.done, cockpitCounts.ignored);
                const width = item.value > 0 ? Math.max(8, (item.value / maxValue) * 100) : 0;
                return (
                  <Button
                    key={item.label}
                    onClick={() => {
                      setView(item.target);
                      if (selectedAccount) setSearch(selectedAccount.name);
                    }}
                    sx={{ display: 'block', p: 0, textAlign: 'left', textTransform: 'none', color: 'text.primary', minWidth: 0 }}
                  >
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Typography variant="caption" sx={{ fontWeight: 850 }}>{item.label}</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 950 }}>{item.value}</Typography>
                    </Stack>
                    <Box sx={{ mt: 0.45, height: 10, borderRadius: 99, bgcolor: alpha(item.color, 0.12), overflow: 'hidden' }}>
                      <Box sx={{ width: `${width}%`, height: '100%', borderRadius: 'inherit', bgcolor: item.color, transition: 'width 240ms ease' }} />
                    </Box>
                  </Button>
                );
              })}
            </Stack>
            <Stack direction="row" spacing={0.8} flexWrap="wrap" useFlexGap sx={{ mt: 1.6 }}>
              <Chip size="small" icon={<VisibilityIcon />} label={`${cockpitCounts.new} neu`} sx={{ fontWeight: 800 }} />
              <Chip size="small" icon={<LocalFireDepartmentIcon />} label={`${cockpitCounts.high} hoch relevant`} color={cockpitCounts.high > 0 ? 'error' : 'default'} variant="outlined" sx={{ fontWeight: 800 }} />
            </Stack>
          </Box>

          <Box sx={{ borderLeft: { md: '1px solid' }, borderColor: { md: 'divider' }, pl: { md: 3 }, minWidth: 0 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 950 }}>
              {selectedAccount ? 'Ausgewählter Account · offener Bestand' : 'Top-Accounts · gesamter offener Bestand'}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {selectedAccount
                ? `„Gesamt“ zählt alle offenen Signale für ${selectedAccount.name}; „${days} Tage“ zeigt den aktuellen Periodenanteil.`
                : `„Gesamt“ zählt alle offenen Signale über alle Zeiträume. „${days} Tage“ zeigt den Anteil in der gewählten Periode.`}
            </Typography>
            {salesOverview.topAccounts.length > 0 ? (
              <Stack spacing={0.85} sx={{ mt: 1.3 }}>
                {salesOverview.topAccounts.map((account) => (
                  <Button
                    key={account.name}
                    onClick={() => openTopAccount(account)}
                    sx={{ display: 'block', p: 0.6, textAlign: 'left', textTransform: 'none', color: 'text.primary', minWidth: 0, borderRadius: 2, bgcolor: selectedAccountId === account.id ? alpha(primary, 0.12) : 'transparent', border: '1px solid', borderColor: selectedAccountId === account.id ? 'primary.main' : 'transparent' }}
                  >
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
                      <Tooltip title={account.logoSource ? `Logo aus: ${account.logoSource}` : account.name} arrow>
                        <Avatar
                          src={resolveAssetUrl(account.logoUrl) || undefined}
                          alt={account.name}
                          variant="rounded"
                          sx={{
                            width: 34,
                            height: 34,
                            flexShrink: 0,
                            bgcolor: alpha(primary, 0.1),
                            color: primary,
                            fontSize: 13,
                            fontWeight: 950,
                            border: '1px solid',
                            borderColor: 'divider',
                          }}
                        >
                          {account.name.trim().charAt(0).toUpperCase() || 'A'}
                        </Avatar>
                      </Tooltip>
                      <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                        <Stack
                          direction={{ xs: 'column', sm: 'row' }}
                          justifyContent="space-between"
                          spacing={{ xs: 0.15, sm: 1 }}
                          alignItems={{ xs: 'flex-start', sm: 'baseline' }}
                          sx={{ minWidth: 0 }}
                        >
                          <Typography variant="caption" noWrap sx={{ minWidth: 0, fontWeight: 850 }}>{account.name}</Typography>
                          <Stack direction="row" spacing={0.8} sx={{ flexShrink: 0 }}>
                            <Typography variant="caption" noWrap sx={{ fontWeight: 950 }}>{account.total} gesamt</Typography>
                            <Typography variant="caption" noWrap color="text.secondary" sx={{ fontWeight: 750 }}>{account.period} / {days} Tage</Typography>
                          </Stack>
                        </Stack>
                        <Box sx={{ mt: 0.45, height: 9, borderRadius: 99, bgcolor: alpha(primary, 0.1), overflow: 'hidden' }}>
                          <Box
                            sx={{
                              width: `${Math.max(10, (account.total / salesOverview.maxAccountSignals) * 100)}%`,
                              height: '100%',
                              borderRadius: 'inherit',
                              background: `linear-gradient(90deg, ${primary}, ${theme.palette.info.main})`,
                            }}
                          />
                        </Box>
                      </Box>
                      {account.hot > 0 && <LocalFireDepartmentIcon color="error" sx={{ fontSize: 17 }} />}
                    </Stack>
                  </Button>
                ))}
              </Stack>
            ) : (
              <Box sx={{ mt: 1.3, p: 2, borderRadius: 2.5, bgcolor: alpha(theme.palette.success.main, 0.07) }}>
                <Typography variant="body2" sx={{ fontWeight: 850 }}>
                  {selectedAccount ? `Keine offenen Signale für ${selectedAccount.name}.` : 'Keine offenen Signale – alles bearbeitet.'}
                </Typography>
              </Box>
            )}
          </Box>
        </Box>

        <Divider sx={{ my: 2.3 }} />
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={0.5}>
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 950 }}>
              Vertriebs-Funnel · {selectedAccount ? selectedAccount.name : 'aktueller Tab'}
            </Typography>
            <Typography variant="caption" color="text.secondary">Eine Phase mit 0 Treffern ist bewusst nicht auswählbar.</Typography>
          </Box>
          {salesStageFilter !== 'all' && (
            <Button size="small" onClick={() => setSalesStageFilter('all')} sx={{ alignSelf: { xs: 'flex-start', sm: 'center' }, fontWeight: 850 }}>
              Filter aufheben
            </Button>
          )}
        </Stack>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(auto-fit, minmax(130px, 1fr))', md: 'repeat(5, minmax(0, 1fr))' }, gap: 1, mt: 1.3 }}>
          {([
            ['contacted', theme.palette.primary.main],
            ['meeting', theme.palette.info.main],
            ['offer', theme.palette.warning.main],
            ['won', theme.palette.success.main],
            ['lost', theme.palette.error.main],
          ] as Array<[SalesStage, string]>).map(([stage, color]) => {
            const selected = salesStageFilter === stage;
            const stageCount = funnelStageCounts[stage];
            return (
              <Button
                key={stage}
                onClick={() => {
                  setSalesStageFilter(selected ? 'all' : stage);
                  if (view === 'accounts') setView('today');
                  if (selectedAccount) setSearch(selectedAccount.name);
                }}
                disabled={!selected && stageCount === 0}
                aria-pressed={selected}
                sx={{
                  p: 1.2,
                  minHeight: 70,
                  minWidth: 0,
                  display: 'block',
                  textTransform: 'none',
                  textAlign: 'left',
                  color: 'text.primary',
                  borderRadius: 2.5,
                  bgcolor: selected ? alpha(color, 0.18) : alpha(color, 0.075),
                  border: '1px solid',
                  borderColor: selected ? color : alpha(color, 0.2),
                  '&.Mui-disabled': { color: 'text.disabled', opacity: 0.62 },
                }}
              >
                <Typography variant="h6" sx={{ color: stageCount > 0 || selected ? color : 'text.disabled', fontWeight: 950, lineHeight: 1 }}>{stageCount}</Typography>
                <Typography variant="caption" sx={{ display: 'block', mt: 0.65, fontWeight: 850, lineHeight: 1.15, whiteSpace: 'normal', overflowWrap: 'anywhere' }}>{salesStageLabels[stage]}</Typography>
              </Button>
            );
          })}
        </Box>
          </Box>
        </Collapse>
      </Paper>

      <Paper ref={calendarSectionRef} elevation={0} sx={{ mt: 2.5, p: { xs: 1.5, md: 2 }, borderRadius: 4, border: '1px solid', borderColor: 'divider', scrollMarginTop: 88 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1.5}>
          <Box sx={{ minWidth: 0 }}>
            <Stack direction="row" spacing={1} alignItems="center">
              <CalendarMonthOutlinedIcon color="primary" />
              <Typography variant="h6" sx={{ fontWeight: 950 }}>Kontaktkalender</Typography>
            </Stack>
            <Stack direction="row" spacing={1.2} useFlexGap flexWrap="wrap" alignItems="center" sx={{ mt: 0.7 }}>
              {[
                ['Geplant', theme.palette.warning.main],
                ['Überfällig', theme.palette.error.main],
                ['Durchgeführt', theme.palette.success.main],
              ].map(([label, color]) => (
                <Stack key={label} direction="row" spacing={0.5} alignItems="center">
                  <Box sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: color }} />
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 800 }}>{label}</Typography>
                </Stack>
              ))}
              <Typography variant="caption" color="text.secondary">Interne Notizen bleiben ausschließlich im Radar.</Typography>
            </Stack>
          </Box>
          <Tooltip title={calendarOpen ? 'Kontaktkalender einklappen' : 'Kontaktkalender öffnen'}>
            <IconButton onClick={() => setCalendarOpen((current) => !current)} aria-expanded={calendarOpen} aria-label="Kontaktkalender ein- oder ausklappen">
              {calendarOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </IconButton>
          </Tooltip>
        </Stack>
        <Collapse in={calendarOpen} timeout="auto">
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1.15fr) minmax(280px, 0.85fr)' }, gap: 2, mt: 1.5 }}>
            <Box sx={{ minWidth: 0 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                <Typography sx={{ fontWeight: 950, textTransform: 'capitalize' }}>
                  {calendarMonth.toLocaleDateString('de-AT', { month: 'long', year: 'numeric' })}
                </Typography>
                <Stack direction="row" spacing={0.4}>
                  <Button size="small" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}>Zurück</Button>
                  <Button size="small" onClick={() => { const now = new Date(); setCalendarMonth(new Date(now.getFullYear(), now.getMonth(), 1)); setCalendarSelectedDate(toLocalDateKey(now)); }}>Heute</Button>
                  <Button size="small" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}>Weiter</Button>
                </Stack>
              </Stack>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 0.35, mt: 0.8 }}>
                {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((day) => (
                  <Typography key={day} variant="caption" color="text.secondary" sx={{ py: 0.25, textAlign: 'center', fontWeight: 900 }}>{day}</Typography>
                ))}
                {calendarDays.map((day) => {
                  const selected = day.dateKey === calendarSelectedDate;
                  const statusColors = Array.from(new Set(day.entries.map((entry) => entry.calendarStatus))).map((status) => (
                    status === 'done' ? theme.palette.success.main : status === 'overdue' ? theme.palette.error.main : theme.palette.warning.main
                  ));
                  const dominantStatus = day.entries.some((entry) => entry.calendarStatus === 'overdue')
                    ? 'overdue'
                    : day.entries.some((entry) => entry.calendarStatus === 'planned') ? 'planned' : day.entries.length ? 'done' : null;
                  const dominantColor = dominantStatus === 'done'
                    ? theme.palette.success.main
                    : dominantStatus === 'overdue' ? theme.palette.error.main : theme.palette.warning.main;
                  return (
                    <Button
                      key={day.dateKey}
                      onClick={() => setCalendarSelectedDate(day.dateKey)}
                      aria-pressed={selected}
                      sx={{
                        minWidth: 0,
                        minHeight: { xs: 42, sm: 48 },
                        p: 0.35,
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'flex-start',
                        color: day.inMonth ? 'text.primary' : 'text.disabled',
                        border: '1px solid',
                        borderColor: selected ? 'primary.main' : dominantStatus ? alpha(dominantColor, 0.5) : 'divider',
                        bgcolor: selected ? alpha(primary, 0.1) : dominantStatus ? alpha(dominantColor, 0.09) : 'transparent',
                        boxShadow: selected ? `inset 0 0 0 1px ${primary}` : 'none',
                        textTransform: 'none',
                        position: 'relative',
                        overflow: 'hidden',
                        '&::before': dominantStatus ? {
                          content: '""', position: 'absolute', top: 0, left: 0, right: 0, height: 3, bgcolor: dominantColor,
                        } : undefined,
                      }}
                    >
                      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ width: '100%', px: 0.2 }}>
                        <Typography variant="caption" sx={{ fontWeight: selected ? 950 : 750, lineHeight: 1 }}>{day.date.getDate()}</Typography>
                        {day.entries.length > 0 && (
                          <Box sx={{ minWidth: 16, height: 16, px: 0.35, borderRadius: 99, display: 'grid', placeItems: 'center', bgcolor: dominantColor, color: theme.palette.getContrastText(dominantColor), fontSize: 9, fontWeight: 950, lineHeight: 1 }}>
                            {day.entries.length}
                          </Box>
                        )}
                      </Stack>
                      <Stack direction="row" spacing={0.3} sx={{ mt: 0.5 }}>
                        {statusColors.slice(0, 3).map((color) => <Box key={color} sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: color }} />)}
                      </Stack>
                    </Button>
                  );
                })}
              </Box>
            </Box>
            <Box sx={{ p: 1.4, borderRadius: 2.5, bgcolor: 'action.hover', minWidth: 0 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 950 }}>
                {new Date(`${calendarSelectedDate}T12:00:00`).toLocaleDateString('de-AT', { weekday: 'long', day: '2-digit', month: 'long' })}
              </Typography>
              {selectedCalendarEntries.length ? (
                <Stack spacing={0.7} sx={{ mt: 0.9, maxHeight: 300, overflowY: 'auto', pr: 0.4 }}>
                  {selectedCalendarEntries.map((entry) => {
                    const color = entry.calendarStatus === 'done' ? theme.palette.success.main : entry.calendarStatus === 'overdue' ? theme.palette.error.main : theme.palette.warning.main;
                    const statusLabel = entry.calendarStatus === 'done' ? 'Durchgeführt' : entry.calendarStatus === 'overdue' ? 'Überfällig' : 'Geplant';
                    return (
                      <Button
                        key={entry.id}
                        onClick={() => openWorkflow(entry)}
                        sx={{
                          justifyContent: 'flex-start', textAlign: 'left', textTransform: 'none', color: 'text.primary',
                          border: '1px solid', borderColor: alpha(color, 0.34), borderLeft: `5px solid ${color}`,
                          bgcolor: alpha(color, 0.075), minWidth: 0, borderRadius: 2, p: 1,
                          '&:hover': { bgcolor: alpha(color, 0.14) },
                        }}
                      >
                        <Box sx={{ minWidth: 0, width: '100%' }}>
                          <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={0.8}>
                            <Typography variant="body2" noWrap sx={{ fontWeight: 900, minWidth: 0 }}>{entry.account_name || 'Account'} · {entry.action_type === 'follow_up' ? 'Wiedervorlage' : 'Kontakt'}</Typography>
                            <Chip
                              size="small"
                              label={statusLabel}
                              sx={{ flexShrink: 0, height: 22, bgcolor: color, color: theme.palette.getContrastText(color), fontWeight: 900, '& .MuiChip-label': { px: 0.8 } }}
                            />
                          </Stack>
                          <Typography variant="caption" color="text.secondary">{formatActionDate(entry.eventDate)}</Typography>
                        </Box>
                      </Button>
                    );
                  })}
                </Stack>
              ) : <Typography variant="body2" color="text.secondary" sx={{ mt: 0.7 }}>Keine Kontakte an diesem Tag.</Typography>}
            </Box>
          </Box>
        </Collapse>
      </Paper>

      <Paper ref={resultsSectionRef} elevation={0} sx={{ mt: 2.5, p: 1, borderRadius: 3.5, border: '1px solid', borderColor: 'divider', position: { xs: 'sticky', md: 'static' }, top: { xs: 64 }, zIndex: 5, bgcolor: alpha(theme.palette.background.paper, 0.96), backdropFilter: 'blur(10px)', scrollMarginTop: { xs: 76, md: 88 } }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ md: 'center' }}>
          <Stack direction="row" spacing={0.6} sx={{ overflowX: 'auto' }}>
            {([
              ['today', isMobile ? `Aktuell (${tabCounts.today})` : `Aktuell · ${days} Tage (${tabCounts.today})`],
              ['accounts', `Accounts ${selectedAccount || selectedCampaign ? cockpitAccounts.length : stats.accounts}`],
              ['planned', `Geplant ${tabCounts.planned}`],
              ['done', `Erledigt ${tabCounts.done}`],
              ['ignored', `Ausgeblendet ${tabCounts.ignored}`],
            ] as Array<[RadarView, string]>).map(([value, label]) => (
              <Button key={value} size="small" variant={view === value ? 'contained' : 'text'} onClick={() => setView(value)} sx={{ flexShrink: 0, minWidth: 0, whiteSpace: 'normal', lineHeight: 1.15, minHeight: 38, px: { xs: 1.25, sm: 1.8 }, fontWeight: 900 }}>{label}</Button>
            ))}
          </Stack>
          <Box sx={{ flexGrow: 1 }} />
          <TextField
            size="small"
            value={search}
            onChange={(event) => { setSearch(event.target.value); setSelectedAccountId(null); }}
            placeholder={view === 'accounts' ? 'Account suchen …' : 'Signal oder Account suchen …'}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
            sx={{ minWidth: { md: 280 }, '& .MuiOutlinedInput-root': { bgcolor: 'background.paper' } }}
          />
          {view !== 'accounts' && (
            <TextField
              select
              size="small"
              label="Verantwortlich"
              value={assigneeFilter}
              onChange={(event) => setAssigneeFilter(event.target.value)}
              sx={{ minWidth: { xs: '100%', sm: 190 }, '& .MuiOutlinedInput-root': { bgcolor: 'background.paper' } }}
            >
              <MenuItem value="all">Alle im Team</MenuItem>
              {user?.id && <MenuItem value={user.id}>Meine Aufgaben</MenuItem>}
              <MenuItem value="unassigned">Nicht zugewiesen</MenuItem>
              {teamMembers.filter((member) => member.id !== user?.id).map((member) => (
                <MenuItem key={member.id} value={member.id}>{member.name}</MenuItem>
              ))}
            </TextField>
          )}
        </Stack>
      </Paper>

      <Box sx={{ mt: 2 }}>
        {loading ? (
          <Box sx={{ minHeight: 280, display: 'grid', placeItems: 'center' }}><CircularProgress /></Box>
        ) : view === 'accounts' ? (
          renderAccounts()
        ) : visibleSignals.length > 0 ? (
          <Stack spacing={1.5}>{visibleSignals.map(renderSignal)}</Stack>
        ) : (
          <Paper elevation={0} sx={{ p: { xs: 4, md: 7 }, borderRadius: 4, border: '1px dashed', borderColor: 'divider', textAlign: 'center' }}>
            <CheckCircleOutlineIcon sx={{ fontSize: 52, color: 'success.main' }} />
            <Typography variant="h6" sx={{ mt: 1, fontWeight: 950 }}>
              {view === 'done'
                ? 'Noch keine erledigten Signale.'
                : view === 'ignored' ? 'Keine ausgeblendeten Treffer.'
                : view === 'planned' ? 'Noch keine Kontakte oder Wiedervorlagen geplant.' : 'Für diesen Filter ist alles erledigt.'}
            </Typography>
            <Typography color="text.secondary" sx={{ mt: 0.6 }}>
              {accounts.length === 0
                ? 'Legen Sie zunächst Accounts zur Beobachtung an.'
                : view === 'planned' ? 'Planen Sie direkt an einem Signal den nächsten Kontakt.' : 'Ändern Sie Zeitraum oder Suche, um weitere Signale zu sehen.'}
            </Typography>
            {canManageAccounts && entitlements?.subscription?.accessActive !== false && accounts.length === 0 && <Button sx={{ mt: 2 }} variant="contained" onClick={goToAccountManagement}>Ersten Account anlegen</Button>}
          </Paper>
        )}
      </Box>

      <AccountDetailDialog
        open={Boolean(detailAccountId)}
        accountId={detailAccountId}
        onClose={() => setDetailAccountId(null)}
        onEdit={canManageAccounts && !isDemoMode
          ? (account) => navigate(`/admin/business-partners/${account.business_partner_id}/accounts`)
          : undefined}
        showCompetitors={entitlements?.features.competitorMonitoring === true}
        readOnly={!canManageAccounts || isDemoMode}
        onManageCompetitors={canManageAccounts && entitlements?.features.competitorMonitoring
          ? (account) => navigate(`/admin/accounts/${account.id}/competitors`)
          : undefined}
        onChanged={() => fetchRadar(true)}
      />

      <Dialog
        open={Boolean(competitorDetail)}
        onClose={() => setCompetitorDetail(null)}
        fullWidth
        maxWidth="md"
        fullScreen={isMobile}
      >
        <DialogTitle sx={{ pr: 7, fontWeight: 950 }}>
          Wettbewerber-Details
          <IconButton onClick={() => setCompetitorDetail(null)} aria-label="Wettbewerber-Details schließen" sx={{ position: 'absolute', right: 12, top: 10 }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers sx={{ p: { xs: 2, md: 3 } }}>
          {competitorDetail && (
            <Stack spacing={2}>
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.2} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }}>
                  <Box>
                    <Button
                      variant="text"
                      onClick={() => {
                        const accountId = competitorDetail.account.id;
                        setCompetitorDetail(null);
                        openAccountDetails(accountId);
                      }}
                      sx={{ p: 0, minWidth: 0, color: 'text.primary', textTransform: 'none', fontSize: '1.05rem', fontWeight: 950 }}
                    >
                      {competitorDetail.account.name}
                    </Button>
                    <Stack direction="row" spacing={0.7} useFlexGap flexWrap="wrap" sx={{ mt: 0.7 }}>
                      <Chip icon={<TrackChangesIcon />} color="secondary" label={`Wettbewerb: ${competitorDetail.competitor.name}`} sx={{ fontWeight: 900 }} />
                      {competitorDetail.signal && <Chip size="small" label={statusLabels[getSignalStatus(competitorDetail.signal)]} color={getSignalStatus(competitorDetail.signal) === 'new' ? 'primary' : 'default'} />}
                    </Stack>
                  </Box>
                  <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                    {getSafeExternalUrl(competitorDetail.competitor.website_url) && <Button component="a" href={getSafeExternalUrl(competitorDetail.competitor.website_url) || undefined} target="_blank" rel="noopener noreferrer" variant="outlined" size="small" endIcon={<OpenInNewIcon />}>Website</Button>}
                    {getSafeExternalUrl(competitorDetail.competitor.linkedin_url) && <Button component="a" href={getSafeExternalUrl(competitorDetail.competitor.linkedin_url) || undefined} target="_blank" rel="noopener noreferrer" variant="outlined" size="small" startIcon={<LinkedInIcon />}>LinkedIn</Button>}
                  </Stack>
                </Stack>
                {competitorDetail.competitor.notes && <Typography variant="body2" color="text.secondary" sx={{ mt: 1.2, whiteSpace: 'pre-line' }}>{competitorDetail.competitor.notes}</Typography>}
              </Paper>

              {competitorDetail.signal ? (
                <Paper variant="outlined" sx={{ p: { xs: 2, md: 2.5 }, borderRadius: 3 }}>
                  <Typography variant="h6" sx={{ fontWeight: 950, lineHeight: 1.3 }}>{competitorDetail.signal.article_title}</Typography>
                  <Stack direction="row" spacing={0.8} useFlexGap flexWrap="wrap" alignItems="center" sx={{ mt: 1.2 }}>
                    <Chip icon={<LocalFireDepartmentIcon />} label={`${competitorDetail.signal.relevance_score || 0}% relevant`} color={(competitorDetail.signal.relevance_score || 0) >= 80 ? 'error' : 'default'} sx={{ fontWeight: 900 }} />
                    <Chip label={competitorDetail.signal.signal_type || 'Wettbewerbssignal'} variant="outlined" sx={{ fontWeight: 800 }} />
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 750 }}>
                      {competitorDetail.signal.source_name || competitorDetail.signal.source_domain || getDomain(competitorDetail.signal.article_url) || 'Quelle'} · {formatDate(competitorDetail.signal.published_at)}
                    </Typography>
                  </Stack>
                  {competitorDetail.signal.summary && (
                    <Box sx={{ mt: 2 }}>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Warum relevant?</Typography>
                      <Typography variant="body2" sx={{ mt: 0.5, lineHeight: 1.6, whiteSpace: 'pre-line' }}>{competitorDetail.signal.summary}</Typography>
                    </Box>
                  )}
                  {competitorDetail.signal.recommended_action && (
                    <Box sx={{ mt: 2, p: 1.5, borderRadius: 2.5, bgcolor: alpha(theme.palette.success.main, 0.08), border: `1px solid ${alpha(theme.palette.success.main, 0.2)}` }}>
                      <Typography variant="caption" color="success.dark" sx={{ display: 'block', fontWeight: 900, textTransform: 'uppercase' }}>Nächster Schritt</Typography>
                      <Typography variant="body2" sx={{ mt: 0.4, fontWeight: 750 }}>{competitorDetail.signal.recommended_action}</Typography>
                    </Box>
                  )}
                </Paper>
              ) : (
                <Alert severity="info">Zu diesem Wettbewerber ist im aktuellen Zeitraum noch kein zugeordnetes Signal geladen.</Alert>
              )}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCompetitorDetail(null)}>Schließen</Button>
          {competitorDetail?.signal && <Button variant="contained" endIcon={<OpenInNewIcon />} onClick={() => openSignal(competitorDetail.signal!)}>Quelle öffnen</Button>}
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(workflowSignal)}
        onClose={() => !workflowSaving && setWorkflowSignal(null)}
        fullWidth
        maxWidth="sm"
        fullScreen={isMobile}
      >
        <DialogTitle sx={{ fontWeight: 950, pb: 1, pr: 7 }}>
          Nächsten Schritt festlegen
          <IconButton
            onClick={() => setWorkflowSignal(null)}
            disabled={workflowSaving}
            aria-label="Workflow schließen"
            sx={{ position: 'absolute', right: 12, top: 10 }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {workflowSignal && (
            <Stack spacing={2}>
              <Stepper activeStep={workflowActiveStep} alternativeLabel sx={{ pt: 0.5, '& .MuiStepLabel-label': { fontSize: { xs: '0.68rem', sm: '0.78rem' } } }}>
                {['Aktion', 'Kontakt & Termin', 'Zuordnung', 'Notiz & Abschluss'].map((label) => <Step key={label}><StepLabel>{label}</StepLabel></Step>)}
              </Stepper>
              <Box sx={{ p: 1.5, borderRadius: 2.5, bgcolor: alpha(primary, 0.06), border: `1px solid ${alpha(primary, 0.14)}` }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 850 }}>{workflowSignal.account_name}</Typography>
                <Typography sx={{ fontWeight: 850, lineHeight: 1.35 }}>{workflowSignal.article_title}</Typography>
                {workflowSignal.recommended_action && (
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'stretch', sm: 'center' }} sx={{ mt: 1 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ flexGrow: 1 }}>
                      Empfehlung: {workflowSignal.recommended_action}
                    </Typography>
                    <Button
                      size="small"
                      variant={ideaApplied ? 'contained' : 'outlined'}
                      color={ideaApplied ? 'success' : 'primary'}
                      startIcon={ideaApplied ? <CheckCircleOutlineIcon /> : <EditNoteIcon />}
                      onClick={applyConversationIdea}
                      sx={{ flexShrink: 0, textTransform: 'none', whiteSpace: 'nowrap' }}
                    >
                      {ideaApplied ? 'Gesprächsidee übernommen' : 'Gesprächsidee übernehmen'}
                    </Button>
                  </Stack>
                )}
              </Box>

              <Box>
                <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 900 }}>1 · Was möchten Sie tun?</Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' }, gap: 1 }}>
                  <Button
                    variant={workflowType === 'contact_planned' ? 'contained' : 'outlined'}
                    startIcon={<PhoneInTalkIcon />}
                    onClick={() => changeWorkflowType('contact_planned')}
                    sx={{ minHeight: 48, whiteSpace: 'nowrap', fontSize: { xs: '0.78rem', sm: '0.875rem' } }}
                  >
                    Kontakt planen
                  </Button>
                  <Button
                    variant={workflowType === 'follow_up' ? 'contained' : 'outlined'}
                    startIcon={<ScheduleIcon />}
                    onClick={() => changeWorkflowType('follow_up')}
                    sx={{ minHeight: 48, whiteSpace: 'nowrap', fontSize: { xs: '0.78rem', sm: '0.875rem' } }}
                  >
                    Wiedervorlage
                  </Button>
                  <Button
                    variant={workflowType === 'note' ? 'contained' : 'outlined'}
                    startIcon={<EditNoteIcon />}
                    onClick={() => changeWorkflowType('note')}
                    sx={{ minHeight: 48, whiteSpace: 'nowrap', fontSize: { xs: '0.78rem', sm: '0.875rem' } }}
                  >
                    Nur Notiz
                  </Button>
                </Box>
              </Box>

              {workflowType === 'contact_planned' && (
                <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2.5 }}>
                  <Stack spacing={1.4}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 900 }}>2a · Ansprechpartner &amp; Kontaktkanal</Typography>
                      {canManageAccounts && (
                        <Button size="small" variant="text" onClick={openWorkflowContactManagement} sx={{ textTransform: 'none', flexShrink: 0 }}>
                          Kontakte pflegen
                        </Button>
                      )}
                    </Stack>
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'minmax(0, 1fr) minmax(0, 1fr)' }, gap: 1.2 }}>
                      <TextField
                        select
                        label="Ansprechpartner"
                        value={workflowContactId}
                        onChange={(event) => selectWorkflowContact(event.target.value)}
                        helperText={workflowContacts.length > 0 ? 'Primärer Kontakt wird vorausgewählt.' : 'Noch kein persönlicher Kontakt hinterlegt.'}
                        fullWidth
                      >
                        <MenuItem value="">Zentrale Kontaktdaten / noch offen</MenuItem>
                        {workflowContacts.map((contact) => (
                          <MenuItem key={contact.id} value={contact.id}>
                            {contact.name}{contact.job_title ? ` · ${contact.job_title}` : ''}{contact.is_primary ? ' · Primär' : ''}
                          </MenuItem>
                        ))}
                      </TextField>
                      <TextField
                        select
                        required
                        label="Kontaktkanal"
                        value={workflowContactChannel}
                        onChange={(event) => setWorkflowContactChannel(event.target.value as ContactChannel | '')}
                        helperText="Bewusst auswählen; wird im Verlauf gespeichert."
                        fullWidth
                      >
                        <MenuItem value="" disabled>Kanal auswählen</MenuItem>
                        {(Object.keys(contactChannelLabels) as ContactChannel[]).map((channel) => (
                          <MenuItem key={channel} value={channel}>
                            <Stack direction="row" spacing={1} alignItems="center">
                              {getContactChannelIcon(channel)}
                              <span>{contactChannelLabels[channel]}</span>
                            </Stack>
                          </MenuItem>
                        ))}
                      </TextField>
                    </Box>

                    {(workflowSelectedContact || workflowContactEmail || workflowContactPhone) ? (
                      <Box sx={{ p: 1.2, borderRadius: 2, bgcolor: alpha(primary, 0.045) }}>
                        <Typography variant="body2" sx={{ fontWeight: 900 }}>
                          {workflowSelectedContact?.name || 'Zentraler Kontakt'}
                        </Typography>
                        {workflowSelectedContact?.job_title && <Typography variant="caption" color="text.secondary">{workflowSelectedContact.job_title}</Typography>}
                        <Stack direction="row" spacing={1.2} useFlexGap flexWrap="wrap" sx={{ mt: 0.7 }}>
                          {workflowContactEmail && <Link href={`mailto:${workflowContactEmail}`} sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.4, fontSize: '0.82rem' }}><EmailOutlinedIcon fontSize="inherit" />{workflowContactEmail}</Link>}
                          {workflowContactPhone && <Link href={`tel:${String(workflowContactPhone).replace(/[^+\d*#]/g, '')}`} sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.4, fontSize: '0.82rem' }}><PhoneInTalkIcon fontSize="inherit" />{workflowContactPhone}</Link>}
                          {workflowContactLinkedIn && <Link href={workflowContactLinkedIn} target="_blank" rel="noopener noreferrer" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.4, fontSize: '0.82rem' }}><LinkedInIcon fontSize="inherit" />LinkedIn</Link>}
                        </Stack>
                      </Box>
                    ) : (
                      <Alert severity="warning" icon={<PersonOutlineIcon />}>
                        Es sind noch keine Kontaktdaten hinterlegt. Die Planung ist trotzdem möglich; ergänzen Sie den Kontakt anschließend in den Account-Details.
                      </Alert>
                    )}
                  </Stack>
                </Paper>
              )}

              {workflowType !== 'note' && (
                <Box>
                  <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 900 }}>{workflowType === 'contact_planned' ? '2b · Kontakttermin' : '2 · Wiedervorlagetermin'}</Typography>
                  <TextField
                    type="datetime-local"
                    label={workflowType === 'contact_planned' ? 'Geplanter Kontakt' : 'Wiedervorlage am'}
                    value={workflowAt}
                    onChange={(event) => setWorkflowAt(event.target.value)}
                    inputProps={{ min: toLocalDateTimeValue(new Date()) }}
                    InputLabelProps={{ shrink: true }}
                    required
                    fullWidth
                  />
                </Box>
              )}

              <Typography variant="subtitle2" sx={{ mb: -1, fontWeight: 900 }}>3 · Zuordnung &amp; Vertriebsstand</Typography>
              <TextField
                select
                label="Verantwortlich"
                value={workflowAssigneeId}
                onChange={(event) => setWorkflowAssigneeId(event.target.value)}
                helperText="Nur berechtigte Admin- und Assistenz-Konten dieses Mandanten"
                fullWidth
              >
                <MenuItem value="">Noch nicht zugewiesen</MenuItem>
                {teamMembers.map((member) => (
                  <MenuItem key={member.id} value={member.id}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Avatar src={member.profile_image_url || undefined} sx={{ width: 24, height: 24, fontSize: '0.72rem' }}>{member.name.slice(0, 1)}</Avatar>
                      <Typography variant="body2" sx={{ fontWeight: 800 }}>{member.name}</Typography>
                      <Typography variant="caption" color="text.secondary">{{ admin: 'Admin', assistenz: 'Assistenz', sales_manager: 'Sales-Manager', sales_user: 'Sales-Nutzer' }[member.role] || member.role}</Typography>
                    </Stack>
                  </MenuItem>
                ))}
              </TextField>

              <TextField
                select
                label="Kampagnen"
                value={workflowCampaignIds}
                onChange={(event) => setWorkflowCampaignIds(typeof event.target.value === 'string' ? event.target.value.split(',') : event.target.value as string[])}
                SelectProps={{
                  multiple: true,
                  renderValue: (selected) => {
                    const ids = selected as string[];
                    return ids.length ? campaigns.filter((campaign) => ids.includes(campaign.id)).map((campaign) => campaign.name).join(', ') : 'Keine Kampagne';
                  },
                }}
                helperText={campaigns.length ? 'Ein Signal kann mehreren Kampagnen zugeordnet werden.' : 'Noch keine Kampagne angelegt.'}
                fullWidth
              >
                {campaigns.filter((campaign) => campaign.status !== 'archived').map((campaign) => (
                  <MenuItem key={campaign.id} value={campaign.id}>
                    <Checkbox checked={workflowCampaignIds.includes(campaign.id)} size="small" />
                    {campaign.name}
                  </MenuItem>
                ))}
              </TextField>

              <TextField
                select
                label="Vertriebsphase"
                value={workflowSalesStage}
                onChange={(event) => {
                  const stage = event.target.value as SalesStage | '';
                  setWorkflowSalesStage(stage);
                  if (stage) setWorkflowOpportunityProbability(String({ contacted: 20, meeting: 40, offer: 70, won: 100, lost: 0 }[stage]));
                }}
                helperText="Gewonnen oder verloren schließt die gemeinsame Aufgabe automatisch ab."
                fullWidth
              >
                <MenuItem value="">Noch keine Vertriebsphase</MenuItem>
                {(Object.keys(salesStageLabels) as SalesStage[]).map((stage) => (
                  <MenuItem key={stage} value={stage}>{salesStageLabels[stage]}</MenuItem>
                ))}
              </TextField>

              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 0.8fr 1fr' }, gap: 1.8, alignItems: 'center' }}>
                <Box sx={{ px: 1 }}>
                  <Typography variant="caption" sx={{ fontWeight: 850 }}>Priorität: {priorityLabels[workflowPriority]}</Typography>
                  <Slider
                    value={priorityValues.indexOf(workflowPriority)}
                    min={0}
                    max={3}
                    step={1}
                    marks={priorityValues.map((priority, index) => ({ value: index, label: priorityLabels[priority].slice(0, 1) }))}
                    onChange={(_event, value) => setWorkflowPriority(priorityValues[Number(value)])}
                    valueLabelDisplay="auto"
                    valueLabelFormat={(value) => priorityLabels[priorityValues[value]]}
                  />
                </Box>
                <TextField type="number" label="Opportunity (€)" value={workflowOpportunityValue} onChange={(event) => setWorkflowOpportunityValue(event.target.value)} inputProps={{ min: 0, max: 100000000, step: 100 }} />
                <Box sx={{ px: 1 }}>
                  <Typography variant="caption" sx={{ fontWeight: 850 }}>Chance: {workflowOpportunityProbability || 0}%</Typography>
                  <Slider value={Number(workflowOpportunityProbability || 0)} min={0} max={100} step={5} onChange={(_event, value) => setWorkflowOpportunityProbability(String(value))} valueLabelDisplay="auto" />
                </Box>
              </Box>

              <Box ref={workflowNoteRef} id="gespraechsidee" sx={{ scrollMarginTop: 90 }}>
                <Stack direction="row" spacing={0.7} alignItems="center" sx={{ mb: 1 }}>
                  <LockOutlinedIcon sx={{ fontSize: 18, color: 'secondary.main' }} />
                  <Typography variant="subtitle2" sx={{ fontWeight: 900 }}>4 · Gesprächsidee &amp; interne Notiz</Typography>
                </Stack>
                <TextField
                  label="Gesprächsidee / interne Notiz"
                  value={workflowNote}
                  onChange={(event) => { setWorkflowNote(event.target.value.slice(0, 1500)); setIdeaApplied(false); }}
                  placeholder="z. B. Anlass, Nutzenargument oder gewünschtes Gesprächsergebnis"
                  multiline
                  minRows={3}
                  helperText={`${workflowNote.length}/1500 Zeichen · ausschließlich für das berechtigte Radar-Team dieses Mandanten sichtbar`}
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end" sx={{ alignSelf: 'flex-start', mt: 0.5 }}>
                        <Tooltip title="Text kopieren"><span><IconButton size="small" onClick={copyWorkflowNote} disabled={!workflowNote.trim()} aria-label="Gesprächsidee kopieren"><ContentCopyOutlinedIcon fontSize="small" /></IconButton></span></Tooltip>
                      </InputAdornment>
                    ),
                  }}
                  fullWidth
                  sx={{ '& .MuiOutlinedInput-root': { bgcolor: alpha(theme.palette.secondary.main, 0.045) } }}
                />
              </Box>

              {workflowType !== 'note' && (
                <Alert severity="info">
                  Das Signal pausiert bis zu diesem Termin im täglichen Radar und im automatischen Daily-Radar. Danach erscheint es wieder als fällig.
                </Alert>
              )}
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, flexWrap: 'wrap' }}>
          {workflowSignal?.action_type && (
            <Button color="inherit" onClick={() => saveWorkflow(true)} disabled={workflowSaving} sx={{ mr: 'auto', whiteSpace: 'nowrap' }}>
              Planung entfernen
            </Button>
          )}
          <Button onClick={() => setWorkflowSignal(null)} disabled={workflowSaving} sx={{ whiteSpace: 'nowrap' }}>Abbrechen</Button>
          <Button
            variant="contained"
            onClick={() => saveWorkflow(false)}
            disabled={workflowSaving
              || (workflowType !== 'note' && !workflowAt)
              || (workflowType === 'contact_planned' && !workflowContactChannel)}
            sx={{ whiteSpace: 'nowrap' }}
          >
            {workflowSaving ? 'Speichert …' : 'Speichern'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(campaignDetailId)}
        onClose={() => setCampaignDetailId(null)}
        fullWidth
        maxWidth="lg"
        fullScreen={isMobile}
      >
        <DialogTitle sx={{ pr: 7, fontWeight: 950 }}>
          Kampagnen-Details
          <IconButton onClick={() => setCampaignDetailId(null)} aria-label="Kampagnendetails schließen" sx={{ position: 'absolute', right: 12, top: 10 }}><CloseIcon /></IconButton>
        </DialogTitle>
        <DialogContent dividers sx={{ p: { xs: 1.5, md: 2.5 } }}>
          <Stack spacing={2}>
            <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'flex-start' }} spacing={1.5}>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="h5" sx={{ fontWeight: 950 }}>{campaignDetail?.campaign.name || 'Kampagne wird geladen …'}</Typography>
                {campaignDetail?.campaign.objective && <Typography color="text.secondary" sx={{ mt: 0.4 }}>{campaignDetail.campaign.objective}</Typography>}
                {campaignDetail?.campaign.owner_user_name && (
                  <Stack direction="row" spacing={0.8} alignItems="center" sx={{ mt: 1 }}>
                    <Avatar src={resolveAssetUrl(campaignDetail.campaign.owner_profile_image_url) || undefined} sx={{ width: 28, height: 28, fontSize: '0.75rem' }}>
                      {campaignDetail.campaign.owner_user_name.charAt(0).toUpperCase()}
                    </Avatar>
                    <Typography variant="caption">
                      Verantwortlich: {campaignDetail.campaign.owner_user_name}{campaignDetail.campaign.owner_user_email ? ` (${campaignDetail.campaign.owner_user_email})` : ''}
                    </Typography>
                  </Stack>
                )}
              </Box>
              <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap">
                {[7, 30, 90, 365].map((period) => (
                  <Button key={period} size="small" variant={campaignDetailPeriod === period ? 'contained' : 'outlined'} onClick={() => setCampaignDetailPeriod(period)} sx={{ whiteSpace: 'nowrap' }}>
                    {period === 365 ? '1 Jahr' : `${period} Tage`}
                  </Button>
                ))}
              </Stack>
            </Stack>

            {campaignDetailLoading && <LinearProgress />}
            {campaignDetailError && <Alert severity="error">{campaignDetailError}</Alert>}
            {campaignDetail?.isSampled && <Alert severity="warning">Die Auswertung ist wegen des sehr großen Datenbestands auf 50.000 Signale begrenzt.</Alert>}

            {campaignDetail && !campaignDetailLoading && (
              <>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' }, gap: 1 }}>
                  {[
                    [campaignDetail.metrics.accounts, 'Accounts'],
                    [campaignDetail.metrics.signals, `Signale · ${campaignDetail.periodDays} Tage`],
                    [opportunityFormatter.format(campaignDetail.metrics.openPipelineValueEur), 'Offene Pipeline'],
                    [opportunityFormatter.format(campaignDetail.metrics.weightedPipelineValueEur), 'Gewichtete Pipeline'],
                  ].map(([value, label]) => (
                    <Paper key={String(label)} variant="outlined" sx={{ p: 1.3, borderRadius: 2.5, borderTop: `4px solid ${primary}` }}>
                      <Typography variant="h6" sx={{ fontWeight: 950, overflowWrap: 'anywhere' }}>{value}</Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 750 }}>{label}</Typography>
                    </Paper>
                  ))}
                </Box>

                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) minmax(0, 1fr)' }, gap: 1.5 }}>
                  <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 3 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 950 }}>Ziel versus Ist</Typography>
                    <Typography variant="caption" color="text.secondary">Ist-Werte im gewählten Zeitraum; Accounts und offene Pipeline zeigen den aktuellen Bestand.</Typography>
                    {configuredCampaignDetailGoals.length ? (
                      <Stack spacing={1.25} sx={{ mt: 1.5 }}>
                        {configuredCampaignDetailGoals.map((goal) => {
                          const progress = campaignProgress(goal.actual, goal.target) || 0;
                          return (
                            <Box key={goal.key}>
                              <Stack direction="row" justifyContent="space-between" spacing={1}>
                                <Typography variant="body2" sx={{ fontWeight: 850 }}>{goal.label}</Typography>
                                <Typography variant="caption" sx={{ whiteSpace: 'nowrap' }}>
                                  {goal.money ? opportunityFormatter.format(goal.actual) : goal.actual} / {goal.money ? opportunityFormatter.format(Number(goal.target)) : goal.target} · {progress}%
                                </Typography>
                              </Stack>
                              <LinearProgress variant="determinate" value={progress} color={progress >= 100 ? 'success' : 'primary'} sx={{ mt: 0.45, height: 9, borderRadius: 99 }} />
                            </Box>
                          );
                        })}
                      </Stack>
                    ) : (
                      <Alert severity="info" sx={{ mt: 1.3 }} action={canConfigureRadar ? <Button color="inherit" onClick={() => { const campaign = campaigns.find((item) => item.id === campaignDetail.campaign.id); setCampaignDetailId(null); if (campaign) openCampaignDialog(campaign); }}>Ziele setzen</Button> : undefined}>
                        Für diese Kampagne sind noch keine Zielwerte hinterlegt.
                      </Alert>
                    )}
                  </Paper>

                  <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 3 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 950 }}>Sales-Funnel</Typography>
                    <Typography variant="caption" color="text.secondary">Statuswechsel im ausgewählten Zeitraum.</Typography>
                    <Stack spacing={1.1} sx={{ mt: 1.5 }}>
                      {campaignDetailFunnel.map((entry) => (
                        <Box key={entry.label}>
                          <Stack direction="row" justifyContent="space-between"><Typography variant="body2" sx={{ fontWeight: 850 }}>{entry.label}</Typography><Typography variant="body2" sx={{ fontWeight: 950 }}>{entry.value}</Typography></Stack>
                          <Box sx={{ mt: 0.35, height: 13, borderRadius: 99, bgcolor: alpha(entry.color, 0.12), overflow: 'hidden' }}>
                            <Box sx={{ height: '100%', width: `${Math.max(entry.value ? 8 : 0, Math.round((entry.value / campaignDetailFunnelMax) * 100))}%`, bgcolor: entry.color, borderRadius: 99, transition: 'width 250ms ease' }} />
                          </Box>
                        </Box>
                      ))}
                    </Stack>
                  </Paper>
                </Box>

                <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 3 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 950 }}>Aktivitätsverlauf</Typography>
                  <Typography variant="caption" color="text.secondary">Signale und Vertriebsaktivitäten je {campaignDetail.periodDays >= 365 ? 'Monat' : campaignDetail.periodDays >= 90 ? 'Woche' : 'Tag'}.</Typography>
                  {campaignDetail.timeline.length ? (
                    <Box sx={{ mt: 1.5, height: 155, display: 'flex', alignItems: 'flex-end', gap: { xs: 0.35, sm: 0.7 }, overflowX: 'auto', pb: 0.5 }}>
                      {campaignDetail.timeline.map((entry, index) => {
                        const total = entry.signals + entry.contacts + entry.meetings + entry.offers + entry.wins;
                        return (
                          <Tooltip key={entry.date} title={`${new Date(`${entry.date}T12:00:00Z`).toLocaleDateString('de-AT')} · ${entry.signals} Signale · ${entry.contacts} Kontakte · ${entry.meetings} Termine · ${entry.offers} Angebote · ${entry.wins} gewonnen`}>
                            <Box sx={{ minWidth: campaignDetail.timeline.length > 35 ? 9 : 18, flex: campaignDetail.timeline.length <= 35 ? 1 : '0 0 auto', maxWidth: 40, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center' }}>
                              <Box sx={{ width: '100%', minHeight: total ? 5 : 2, height: `${Math.max(total ? 5 : 2, Math.round((total / campaignTimelineMax) * 120))}px`, borderRadius: '4px 4px 0 0', background: `linear-gradient(180deg, ${theme.palette.success.main}, ${primary})` }} />
                              {(index === 0 || index === campaignDetail.timeline.length - 1 || (campaignDetail.timeline.length <= 14 && index % 3 === 0)) && (
                                <Typography sx={{ fontSize: 8, mt: 0.4, whiteSpace: 'nowrap' }}>{new Date(`${entry.date}T12:00:00Z`).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit' })}</Typography>
                              )}
                            </Box>
                          </Tooltip>
                        );
                      })}
                    </Box>
                  ) : <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>Noch keine Aktivität im gewählten Zeitraum.</Typography>}
                </Paper>

                <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 3 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 950 }}>Accounts in dieser Kampagne</Typography>
                  <Box sx={{ mt: 1.2, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' }, gap: 0.8 }}>
                    {campaignDetail.accounts.map((account) => (
                      <Button key={account.id} onClick={() => { setCampaignDetailId(null); setSelectedAccountId(account.id); setCampaignFilter(campaignDetail.campaign.id); setView('accounts'); }} sx={{ p: 1, justifyContent: 'flex-start', textAlign: 'left', textTransform: 'none', color: 'text.primary', border: '1px solid', borderColor: 'divider', minWidth: 0 }}>
                        <Avatar src={resolveAssetUrl(account.logo_url) || undefined} variant="rounded" sx={{ width: 36, height: 36, mr: 1, bgcolor: alpha(primary, 0.08) }}>{account.name.charAt(0).toUpperCase()}</Avatar>
                        <Box sx={{ minWidth: 0 }}>
                          <Typography variant="body2" noWrap sx={{ fontWeight: 900 }}>{account.name}</Typography>
                          <Typography variant="caption" color="text.secondary">{account.signal_count} Signale · {account.open_task_count} offen · {account.won_count} gewonnen</Typography>
                        </Box>
                      </Button>
                    ))}
                    {!campaignDetail.accounts.length && <Typography variant="body2" color="text.secondary">Noch keine Accounts oder Signale zugeordnet.</Typography>}
                  </Box>
                </Paper>
              </>
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: { xs: 1.5, md: 2.5 }, py: 1.5, flexWrap: 'wrap' }}>
          {campaignDetail && (
            <Button onClick={() => { setCampaignFilter(campaignDetail.campaign.id); setSelectedAccountId(null); setSearch(''); setCampaignDetailId(null); }} startIcon={<TrackChangesIcon />} sx={{ mr: 'auto', whiteSpace: 'nowrap' }}>
              Als Fokus verwenden
            </Button>
          )}
          {campaignDetail && canConfigureRadar && (
            <Button onClick={() => { const campaign = campaigns.find((item) => item.id === campaignDetail.campaign.id); setCampaignDetailId(null); if (campaign) openCampaignDialog(campaign); }} sx={{ whiteSpace: 'nowrap' }}>Bearbeiten</Button>
          )}
          <Button variant="contained" onClick={() => setCampaignDetailId(null)}>Schließen</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={campaignDialogOpen} onClose={() => !campaignSaving && setCampaignDialogOpen(false)} fullWidth maxWidth="md" fullScreen={isMobile}>
        <DialogTitle sx={{ pr: 7, fontWeight: 950 }}>
          Kampagnen organisieren
          <IconButton onClick={() => setCampaignDialogOpen(false)} disabled={campaignSaving} aria-label="Kampagnen schließen" sx={{ position: 'absolute', right: 12, top: 10 }}><CloseIcon /></IconButton>
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2.2}>
            <Alert severity="info">Kampagnen bündeln Themen, Accounts und einzelne Signale. Ein Account oder Signal kann mehreren Kampagnen angehören.</Alert>
            <Box>
              <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                <Typography variant="subtitle2" sx={{ fontWeight: 950 }}>Bestehende Kampagnen</Typography>
                <Button size="small" startIcon={<RestartAltIcon />} onClick={() => openCampaignDialog()}>Neue Kampagne</Button>
              </Stack>
              <Stack direction="row" spacing={0.8} useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
                {campaigns.length ? campaigns.map((campaign) => (
                  <Button
                    key={campaign.id}
                    size="small"
                    variant={editingCampaignId === campaign.id ? 'contained' : 'outlined'}
                    onClick={() => openCampaignDialog(campaign)}
                    sx={{ textTransform: 'none' }}
                  >
                    {campaign.name} · {campaign.account_count} Accounts · {campaign.open_task_count} offen
                  </Button>
                )) : <Typography variant="body2" color="text.secondary">Noch keine Kampagne vorhanden.</Typography>}
              </Stack>
            </Box>

            <Divider />
            <Typography variant="h6" sx={{ fontWeight: 950 }}>{editingCampaignId ? 'Kampagne bearbeiten' : 'Neue Kampagne'}</Typography>
            <TextField label="Kampagnenname" required value={campaignForm.name} onChange={(event) => setCampaignForm((current) => ({ ...current, name: event.target.value.slice(0, 120) }))} inputProps={{ maxLength: 120 }} fullWidth />
            <TextField label="Ziel / Thema" value={campaignForm.objective} onChange={(event) => setCampaignForm((current) => ({ ...current, objective: event.target.value.slice(0, 1000) }))} multiline minRows={2} helperText={`${campaignForm.objective.length}/1000 Zeichen`} fullWidth />
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 1.5 }}>
              <TextField select label="Status" value={campaignForm.status} onChange={(event) => setCampaignForm((current) => ({ ...current, status: event.target.value as RadarCampaign['status'] }))}>
                {(Object.keys(campaignStatusLabels) as RadarCampaign['status'][]).map((status) => <MenuItem key={status} value={status}>{campaignStatusLabels[status]}</MenuItem>)}
              </TextField>
              <TextField select label="Verantwortlich" value={campaignForm.owner_user_id} onChange={(event) => setCampaignForm((current) => ({ ...current, owner_user_id: event.target.value }))}>
                <MenuItem value="">Noch nicht zugewiesen</MenuItem>
                {teamMembers.map((member) => (
                  <MenuItem key={member.id} value={member.id}>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
                      <Avatar src={resolveAssetUrl(member.profile_image_url) || undefined} sx={{ width: 28, height: 28, fontSize: '0.75rem' }}>
                        {member.name.trim().charAt(0).toUpperCase() || 'U'}
                      </Avatar>
                      <Typography variant="body2" noWrap>
                        {member.name}{member.email ? ` (${member.email})` : ''}
                      </Typography>
                    </Stack>
                  </MenuItem>
                ))}
              </TextField>
              <TextField type="date" label="Start" value={campaignForm.starts_on} onChange={(event) => setCampaignForm((current) => ({ ...current, starts_on: event.target.value }))} InputLabelProps={{ shrink: true }} />
              <TextField type="date" label="Ende" value={campaignForm.ends_on} onChange={(event) => setCampaignForm((current) => ({ ...current, ends_on: event.target.value }))} InputLabelProps={{ shrink: true }} />
            </Box>

            <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 3, bgcolor: alpha(primary, 0.025) }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 950 }}>Messbare Ziele <Typography component="span" variant="caption" color="text.secondary">(optional)</Typography></Typography>
              <Typography variant="caption" color="text.secondary">Nur gesetzte Ziele fließen in den Kampagnenfortschritt ein. Leere Felder bleiben neutral.</Typography>
              <Box sx={{ mt: 1.4, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', md: 'repeat(3, minmax(0, 1fr))' }, gap: 1.2 }}>
                {([
                  ['target_accounts', 'Ziel-Accounts'],
                  ['target_contacts', 'Ziel-Kontakte'],
                  ['target_meetings', 'Ziel-Termine'],
                  ['target_offers', 'Ziel-Angebote'],
                  ['target_wins', 'Ziel-Abschlüsse'],
                ] as const).map(([field, label]) => (
                  <TextField
                    key={field}
                    type="number"
                    size="small"
                    label={label}
                    value={campaignForm[field]}
                    onChange={(event) => setCampaignForm((current) => ({ ...current, [field]: event.target.value }))}
                    inputProps={{ min: 0, max: 1000000, step: 1 }}
                  />
                ))}
                <TextField
                  type="number"
                  size="small"
                  label="Pipeline-Ziel (€)"
                  value={campaignForm.target_pipeline_eur}
                  onChange={(event) => setCampaignForm((current) => ({ ...current, target_pipeline_eur: event.target.value }))}
                  inputProps={{ min: 0, max: 1000000000000, step: 100 }}
                />
              </Box>
            </Paper>

            <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 3 }}>
              <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1} alignItems={{ sm: 'center' }}>
                <Box>
                  <Typography variant="subtitle2" sx={{ fontWeight: 950 }}>Accounts zuordnen</Typography>
                  <Typography variant="caption" color="text.secondary">{campaignForm.account_ids.length} von {accounts.length} ausgewählt. Einzelne Signale werden im Dialog „Nächsten Schritt“ zugeordnet.</Typography>
                </Box>
                <Stack direction="row" spacing={0.5}>
                  <Button size="small" onClick={() => setCampaignForm((current) => ({ ...current, account_ids: accounts.map((account) => account.id) }))}>Alle</Button>
                  <Button size="small" onClick={() => setCampaignForm((current) => ({ ...current, account_ids: [] }))}>Keine</Button>
                </Stack>
              </Stack>
              <TextField size="small" value={campaignAccountSearch} onChange={(event) => setCampaignAccountSearch(event.target.value)} placeholder="Account suchen …" InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }} fullWidth sx={{ mt: 1.2 }} />
              <Box sx={{ mt: 1, maxHeight: 280, overflowY: 'auto', display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 0.5 }}>
                {accounts.filter((account) => account.name.toLocaleLowerCase('de').includes(campaignAccountSearch.trim().toLocaleLowerCase('de'))).map((account) => (
                  <Button key={account.id} onClick={() => toggleCampaignAccount(account.id)} sx={{ justifyContent: 'flex-start', color: 'text.primary', textTransform: 'none', minWidth: 0 }}>
                    <Checkbox checked={campaignForm.account_ids.includes(account.id)} size="small" />
                    <Typography variant="body2" noWrap>{account.name}</Typography>
                  </Button>
                ))}
              </Box>
            </Paper>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setCampaignDialogOpen(false)} disabled={campaignSaving}>Abbrechen</Button>
          <Button variant="contained" onClick={saveCampaign} disabled={campaignSaving || campaignForm.name.trim().length < 2}>{campaignSaving ? 'Speichert …' : 'Kampagne speichern'}</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={calendarFeedOpen} onClose={() => !calendarFeedLoading && setCalendarFeedOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ pr: 7, fontWeight: 950 }}>
          Externen Kalender einbinden
          <IconButton onClick={() => setCalendarFeedOpen(false)} disabled={calendarFeedLoading} aria-label="Kalenderfeed schließen" sx={{ position: 'absolute', right: 12, top: 10 }}><CloseIcon /></IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {calendarFeedLoading && !calendarFeed ? <Box sx={{ py: 5, display: 'grid', placeItems: 'center' }}><CircularProgress /></Box> : (
            <Stack spacing={2}>
              <Alert severity="warning">Der Link ist ein geheimer Lesezugang zu den Kontaktterminen dieses Mandanten. Nur gezielt teilen. Interne Notizen werden nicht übertragen.</Alert>
              {calendarFeed?.enabled && calendarFeed.url ? (
                <>
                  <TextField
                    label="Kalenderfeed-URL"
                    value={calendarFeed.url}
                    fullWidth
                    InputProps={{ readOnly: true, endAdornment: <InputAdornment position="end"><Tooltip title="Link kopieren"><IconButton onClick={copyCalendarFeed}><ContentCopyOutlinedIcon /></IconButton></Tooltip></InputAdornment> }}
                    helperText="In Outlook, Apple Kalender oder Google Kalender als Kalender per URL abonnieren."
                  />
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                    <Button variant="outlined" startIcon={<RestartAltIcon />} onClick={rotateCalendarFeed} disabled={calendarFeedLoading}>Link erneuern</Button>
                    <Button color="error" onClick={disableCalendarFeed} disabled={calendarFeedLoading}>Feed deaktivieren</Button>
                  </Stack>
                </>
              ) : (
                <Box sx={{ py: 2, textAlign: 'center' }}>
                  <CalendarMonthOutlinedIcon sx={{ fontSize: 46, color: 'text.disabled' }} />
                  <Typography sx={{ mt: 1, fontWeight: 900 }}>Noch kein Kalenderfeed aktiv.</Typography>
                  <Button sx={{ mt: 2 }} variant="contained" onClick={rotateCalendarFeed} disabled={calendarFeedLoading}>Sicheren Feed erstellen</Button>
                </Box>
              )}
            </Stack>
          )}
        </DialogContent>
        <DialogActions><Button onClick={() => setCalendarFeedOpen(false)}>Schließen</Button></DialogActions>
      </Dialog>

      <Dialog open={Boolean(relevanceSignal)} onClose={() => !relevanceSaving && setRelevanceSignal(null)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ fontWeight: 950, pr: 7 }}>
          Trefferqualität erfassen
          <IconButton onClick={() => setRelevanceSignal(null)} disabled={relevanceSaving} aria-label="Dialog schließen" sx={{ position: 'absolute', right: 12, top: 10 }}><CloseIcon /></IconButton>
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Alert severity="info">Der Grund fließt mandantenspezifisch in Quellenbewertung und Management-Auswertung ein.</Alert>
            <TextField select required label="Warum ist der Treffer nicht relevant?" value={relevanceReason} onChange={(event) => setRelevanceReason(event.target.value as RelevanceReason)} fullWidth>
              {(Object.keys(relevanceReasonLabels) as RelevanceReason[]).map((reason) => <MenuItem key={reason} value={reason}>{relevanceReasonLabels[reason]}</MenuItem>)}
            </TextField>
            <TextField label="Optionaler Hinweis" value={relevanceNote} onChange={(event) => setRelevanceNote(event.target.value.slice(0, 500))} multiline minRows={3} helperText={`${relevanceNote.length}/500 Zeichen`} fullWidth />
          </Stack>
        </DialogContent>
        <DialogActions><Button onClick={() => setRelevanceSignal(null)} disabled={relevanceSaving}>Abbrechen</Button><Button variant="contained" color="error" onClick={() => saveRelevance('irrelevant')} disabled={relevanceSaving || !relevanceReason}>{relevanceSaving ? 'Speichert …' : 'Ausblenden'}</Button></DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(activitySignal)}
        onClose={() => setActivitySignal(null)}
        fullWidth
        maxWidth="sm"
        fullScreen={isMobile}
      >
        <DialogTitle sx={{ pr: 7 }}>
          <Typography component="span" sx={{ display: 'block', fontWeight: 950 }}>Aktivitätsverlauf</Typography>
          {activitySignal && (
            <Typography component="span" variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
              {activitySignal.account_name} ·{' '}
              {getSafeExternalUrl(activitySignal.article_url) ? (
                <Link
                  href={getSafeExternalUrl(activitySignal.article_url) || undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  underline="hover"
                  sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.35, fontWeight: 750 }}
                >
                  {activitySignal.article_title}
                  <OpenInNewIcon sx={{ fontSize: 13 }} />
                </Link>
              ) : activitySignal.article_title}
            </Typography>
          )}
          <IconButton onClick={() => setActivitySignal(null)} aria-label="Aktivitätsverlauf schließen" sx={{ position: 'absolute', right: 12, top: 12 }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {activityLoading ? (
            <Box sx={{ minHeight: 180, display: 'grid', placeItems: 'center' }}><CircularProgress size={30} /></Box>
          ) : activityItems.length > 0 ? (
            <Stack divider={<Divider flexItem />}>
              {activityItems.map((item) => {
                const activityLabel: Record<RadarActivity['event_type'], string> = {
                  created: 'Aufgabe angelegt',
                  updated: 'Planung aktualisiert',
                  assigned: 'Verantwortlichkeit geändert',
                  stage_changed: 'Vertriebsphase geändert',
                  completed: 'Aufgabe erledigt',
                  reopened: 'Aufgabe wieder geöffnet',
                  cancelled: 'Planung entfernt',
                };
                return (
                  <Stack key={item.id} direction="row" spacing={1.4} sx={{ py: 1.5 }}>
                    <Avatar src={item.actor_profile_image_url || undefined} sx={{ width: 36, height: 36, fontSize: '0.82rem', bgcolor: 'primary.main' }}>
                      {(item.actor_name || '?').slice(0, 1)}
                    </Avatar>
                    <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                      <Stack direction="row" justifyContent="space-between" spacing={1} alignItems="baseline">
                        <Typography variant="body2" sx={{ fontWeight: 900 }}>{activityLabel[item.event_type] || item.event_type}</Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>{formatActionDate(item.created_at)}</Typography>
                      </Stack>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.2 }}>{item.actor_name}</Typography>
                      <Stack direction="row" spacing={0.7} flexWrap="wrap" useFlexGap sx={{ mt: 0.65 }}>
                        {item.event_data?.assigned_user_name && <Chip size="small" label={`Verantwortlich: ${item.event_data.assigned_user_name}`} />}
                        {item.event_data?.contact_name && <Chip size="small" icon={<PersonOutlineIcon />} label={`Kontakt: ${item.event_data.contact_name}`} variant="outlined" />}
                        {item.event_data?.contact_channel && <Chip size="small" icon={getContactChannelIcon(item.event_data.contact_channel)} label={contactChannelLabels[item.event_data.contact_channel]} variant="outlined" />}
                        {item.event_data?.follow_up_at && <Chip size="small" icon={<ScheduleIcon />} label={formatActionDate(item.event_data.follow_up_at)} variant="outlined" />}
                        {item.event_data?.sales_stage && <Chip size="small" label={salesStageLabels[item.event_data.sales_stage]} color={item.event_data.sales_stage === 'won' ? 'success' : item.event_data.sales_stage === 'lost' ? 'error' : 'primary'} />}
                        {item.event_data?.note_changed && <Chip size="small" label="Notiz geändert" variant="outlined" />}
                      </Stack>
                    </Box>
                  </Stack>
                );
              })}
            </Stack>
          ) : (
            <Box sx={{ py: 6, textAlign: 'center' }}>
              <HistoryIcon sx={{ fontSize: 46, color: 'text.disabled' }} />
              <Typography sx={{ mt: 1, fontWeight: 900 }}>Noch keine Team-Aktivitäten.</Typography>
              <Typography variant="body2" color="text.secondary">Die nächsten Änderungen werden hier nachvollziehbar protokolliert.</Typography>
            </Box>
          )}
        </DialogContent>
      </Dialog>

      {notice && (
        <Alert severity="success" sx={{ position: 'fixed', right: 24, bottom: 24, zIndex: 1400, boxShadow: 4 }} onClose={() => setNotice(null)}>
          {notice}
        </Alert>
      )}
    </Container>
  );
};

export default AccountRadarPage;
