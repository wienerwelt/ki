// frontend/src/pages/CommunityPage.tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    Container, Grid, Paper, Typography, Box, Button, Stack,
    Card, CardHeader, CardContent, CardMedia, CardActions, IconButton,
    Divider, CircularProgress, Tooltip, Chip, useTheme, useMediaQuery,
    MenuItem, Select, FormControl, InputLabel, Collapse, Popover,
    Tabs, Tab, List, ListItem, ListItemAvatar, ListItemText, InputAdornment,
    TextField, Alert, Dialog, DialogTitle, DialogContent,
    DialogActions, Rating, alpha, LinearProgress
} from '@mui/material';
import { useLocation, useNavigate } from 'react-router-dom';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import DOMPurify from 'dompurify';

// Icons
import SendIcon from '@mui/icons-material/Send';
import ImageIcon from '@mui/icons-material/Image';
import ThumbUpIcon from '@mui/icons-material/ThumbUp';
import ThumbUpOutlinedIcon from '@mui/icons-material/ThumbUpOutlined';
import CommentIcon from '@mui/icons-material/Comment';
import DeleteIcon from '@mui/icons-material/Delete';
import StarsIcon from '@mui/icons-material/Stars';
import GroupIcon from '@mui/icons-material/Group';
import PushPinIcon from '@mui/icons-material/PushPin';
import PushPinOutlinedIcon from '@mui/icons-material/PushPinOutlined';
import DynamicFeedIcon from '@mui/icons-material/DynamicFeed';
import PersonSearchIcon from '@mui/icons-material/PersonSearch';
import SearchIcon from '@mui/icons-material/Search';
import ReportProblemIcon from '@mui/icons-material/ReportProblem';
import PollIcon from '@mui/icons-material/Poll';
import SchoolIcon from '@mui/icons-material/School';
import LocalOfferIcon from '@mui/icons-material/LocalOffer';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import CloseIcon from '@mui/icons-material/Close';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import SettingsSuggestIcon from '@mui/icons-material/SettingsSuggest';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';

// App Context, Utils & Components
import { useAuth } from '../context/AuthContext';
import apiClient from '../apiClient';
import { useSnackbar } from '../context/SnackbarContext';
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';
import { ProfileCard, UserAvatarWithStatus, UserProfileData } from '../components/ProfileCard';

// --- TYPES ---
interface ExpertUser extends UserProfileData {
    tags: string[] | null;
    business_partner_name?: string;
}

interface Comment extends UserProfileData {
    content: string;
    created_at: string;
    author_id: string;
}

interface PollOption {
    id: string;
    text: string;
    votes: number;
    is_voted_by_me: boolean;
}

interface CommunityPost extends UserProfileData {
    id: string;
    content: string;
    image_url: string | null;
    created_at: string;
    category_name?: string;
    category_id?: string;
    author_id: string;
    like_count: number;
    comment_count: number;
    is_liked_by_me: boolean;
    comments?: Comment[]; 
    commentsOpen?: boolean;
    is_pinned: boolean;
    author_role?: string;
    poll_options?: PollOption[];
    software_tool_id?: string;
    software_rating?: number | null;
    software_tool_name?: string;
    software_provider_name?: string;
    software_tool_url?: string;
    software_tool_logo_url?: string;
}

interface Category { id: string; name: string; }
interface SoftwareOption { id: string; name: string; provider_name: string; logo_url?: string | null; }
interface LeaderboardUser extends UserProfileData {}
interface Member extends UserProfileData {
    email: string;
}
interface RecentComment {
    id: string;
    content: string;
    created_at: string;
    post_id: string;
    username: string;
    first_name: string | null;
    last_name: string | null;
    profile_image_url: string | null;
    author_id: string;
}

// --- HELPER ---
const safeFormatDistance = (dateString: string | undefined | null) => {
    if (!dateString) return 'Gerade eben';
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return 'Gerade eben';
        return formatDistanceToNow(date, { addSuffix: true, locale: de });
    } catch (e) {
        return 'Gerade eben';
    }
};

const getCommunityRoleLabel = (role?: string) => {
    if (role === 'admin') return 'Administrator';
    if (role === 'assistenz') return 'Assistenz';
    return 'Mitglied';
};

const CommunityProfileDetails: React.FC<{ profile: UserProfileData }> = ({ profile }) => {
    const organization = profile.organization_name?.trim() || profile.business_partner_name?.trim() || 'Nicht angegeben';
    const expertise = Array.from(new Set((profile.tags || []).map((tag) => String(tag || '').trim()).filter(Boolean)));

    return (
        <Box component="span" sx={{ display: 'block', mt: 0.5 }}>
            <Typography component="span" variant="body2" color="text.secondary" display="block">
                {getCommunityRoleLabel(profile.role)}
            </Typography>
            <Typography component="span" variant="body2" color="text.primary" display="block" sx={{ mt: 0.35 }}>
                Organisation: <strong>{organization}</strong>
            </Typography>
            {expertise.length > 0 && (
                <Box component="span" sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0.5, mt: 0.8 }}>
                    <Typography component="span" variant="caption" color="text.secondary" fontWeight="bold">Experte für:</Typography>
                    {expertise.map((tag) => <Chip key={tag} label={tag} size="small" sx={{ height: 22, fontSize: '0.7rem' }} />)}
                </Box>
            )}
        </Box>
    );
};

const renderMedia = (url: string) => {
    const isVideo = url.match(/\.(mp4|webm|mov)$/i);
    if (isVideo) return <Box sx={{ bgcolor: 'black', display: 'flex', justifyContent: 'center', py: 1 }}><video controls src={url} style={{ maxHeight: 500, maxWidth: '100%' }} /></Box>;
    return <CardMedia component="img" image={url} alt="Post attachment" sx={{ maxHeight: 500, objectFit: 'contain', bgcolor: '#f0f0f0' }} />;
};

// --- REACT QUILL MODULES ---
const quillModules = {
    toolbar: [
        ['bold', 'italic', 'underline', 'strike'],
        [{ 'list': 'ordered'}, { 'list': 'bullet' }],
        ['link'],
        ['clean']
    ]
};

const quillFormats = [
    'bold', 'italic', 'underline', 'strike',
    'list', 'bullet',
    'link'
];

const HTMLContentRenderer: React.FC<{ html: string }> = ({ html }) => {
    // Sanitizing HTML mit DOMPurify um XSS zu verhindern, target="_blank" für Links erlauben
    DOMPurify.addHook('afterSanitizeAttributes', function (node) {
        if ('target' in node) {
            node.setAttribute('target', '_blank');
            node.setAttribute('rel', 'noopener noreferrer');
        }
    });
    const cleanHtml = DOMPurify.sanitize(html || '');

    return (
        <Typography 
            variant="body1" 
            component="div" 
            className="ql-editor" // Wendet Quill Styles auf den Output an
            sx={{ p: 0, '& p': { m: 0, mb: 1 }, '& a': { color: 'primary.main', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } } }}
            dangerouslySetInnerHTML={{ __html: cleanHtml }} 
        />
    );
};

const CommunityPage: React.FC = () => {
  const { user, userTags } = useAuth();
  const { showSnackbar } = useSnackbar();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const location = useLocation();
  const navigate = useNavigate();

  const isDemo = user?.role === 'demo';

  const [currentTab, setCurrentTab] = useState<'feed' | 'members' | 'experts'>('feed');
  
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardUser[]>([]);
  const [recentComments, setRecentComments] = useState<RecentComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCategory, setFilterCategory] = useState('all');
  
  const [members, setMembers] = useState<Member[]>([]);
  const [memberSearch, setMemberSearch] = useState('');
  const [membersLoading, setMembersLoading] = useState(false);

  const [expertSearch, setExpertSearch] = useState('');
  const [experts, setExperts] = useState<ExpertUser[]>([]);
  const [expertsLoading, setExpertsLoading] = useState(false);

  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [selectedUser, setSelectedUser] = useState<UserProfileData | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const profileRequestRef = useRef(0);

  const [detailPost, setDetailPost] = useState<CommunityPost | null>(null);

  const [createLoading, setCreateLoading] = useState(false);
  const [newContent, setNewContent] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [softwareOptions, setSoftwareOptions] = useState<SoftwareOption[]>([]);
  const [selectedSoftwareToolId, setSelectedSoftwareToolId] = useState('');
  const [softwareRating, setSoftwareRating] = useState<number | null>(null);
  
  const [isPollMode, setIsPollMode] = useState(false);
  const [pollOptions, setPollOptions] = useState(['', '']);

  // Editieren States
  const [editingPost, setEditingPost] = useState<CommunityPost | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editCategoryId, setEditCategoryId] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [commentInputs, setCommentInputs] = useState<{ [postId: string]: string }>({});

  const loadFeedData = useCallback(async () => {
    try {
        const [postsRes, catRes, lbRes, commentsRes, softwareRes] = await Promise.all([
            apiClient.get(`/api/community/feed?limit=20&categoryId=${filterCategory}`),
            apiClient.get('/api/community/categories'),
            apiClient.get('/api/community/leaderboard'),
            apiClient.get('/api/community/recent-comments'),
            apiClient.get('/api/software/options')
        ]);
        setPosts(postsRes.data);
        setCategories(catRes.data);
        setLeaderboard(lbRes.data);
        setRecentComments(commentsRes.data);
        setSoftwareOptions(softwareRes.data || []);
    } catch (err) {
        showSnackbar('Fehler beim Laden des Feeds.', 'error');
    } finally {
        setLoading(false);
    }
  }, [filterCategory, showSnackbar]);

  useEffect(() => { loadFeedData(); }, [loadFeedData]);

  const fetchMembers = useCallback(async () => {
    setMembersLoading(true);
    try {
        const res = await apiClient.get(`/api/community/members?search=${encodeURIComponent(memberSearch)}`);
        setMembers(res.data);
    } catch (e) { 
        showSnackbar('Mitglieder konnten nicht geladen werden.', 'error'); 
    } finally { 
        setMembersLoading(false); 
    }
  }, [memberSearch, showSnackbar]);

  useEffect(() => {
      if (currentTab === 'members') {
          const timer = setTimeout(() => fetchMembers(), 300);
          return () => clearTimeout(timer);
      }
  }, [currentTab, memberSearch, fetchMembers]);

  const fetchExperts = useCallback(async (searchTermOverride?: string) => {
    const term = searchTermOverride !== undefined ? searchTermOverride : expertSearch;
    if (!term.trim()) return; 
    setExpertsLoading(true);
    try {
        const res = await apiClient.get(`/api/community/experts?query=${encodeURIComponent(term)}`);
        setExperts(res.data);
    } catch (e) {
        showSnackbar('Fehler bei der Expertensuche.', 'error');
    } finally {
        setExpertsLoading(false);
    }
  }, [expertSearch, showSnackbar]);

  const handleExpertSearchSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      fetchExperts();
  };

  useEffect(() => {
    if (location.state && (location.state as any).defaultTab) {
        setCurrentTab((location.state as any).defaultTab);
    }
    const requestedSoftwareId = (location.state as any)?.softwareToolId;
    if (requestedSoftwareId) {
        setSelectedSoftwareToolId(String(requestedSoftwareId));
        const requestedRating = Number((location.state as any)?.softwareRating);
        if (Number.isInteger(requestedRating) && requestedRating >= 1 && requestedRating <= 5) {
            setSoftwareRating(requestedRating);
        }
    }
  }, [location]);

  useEffect(() => {
    if (!selectedSoftwareToolId || categories.length === 0) return;
    const softwareCategory = categories.find(c => c.name.toLowerCase() === 'software & tools');
    if (softwareCategory) setSelectedCategory(softwareCategory.id);
  }, [categories, selectedSoftwareToolId]);

  const handleOpenPostDetail = async (postId: string) => {
      const existingPost = posts.find(p => p.id === postId);
      if (existingPost) {
          setDetailPost(existingPost);
          if (!existingPost.commentsOpen) toggleComments(postId);
          return;
      }
      try {
          const res = await apiClient.get(`/api/community/feed/${postId}`);
          const postData = res.data;
          const commRes = await apiClient.get(`/api/community/feed/${postId}/comments`);
          postData.comments = commRes.data;
          postData.commentsOpen = true; 
          setDetailPost(postData);
      } catch (e) {
          showSnackbar('Beitrag konnte nicht geladen werden.', 'error');
      }
  };

  const handleCreatePost = async () => {
    if (isDemo) return; 
    // Strip HTML Tags nur für leeren Check
    const cleanText = newContent.replace(/<[^>]*>?/gm, '').trim();
    if (!cleanText && !selectedImage && !selectedSoftwareToolId && (!isPollMode || pollOptions.every(o => !o.trim()))) {
        showSnackbar('Bitte Text, Bild, Umfrage oder eine Software-Bewertung angeben.', 'warning');
        return;
    }
    if (!selectedCategory && !selectedSoftwareToolId) { showSnackbar('Bitte eine Kategorie wählen.', 'warning'); return; }

    setCreateLoading(true);
    const formData = new FormData();
    formData.append('content', newContent); // Schickt sauberes HTML
    formData.append('categoryId', selectedCategory);
    if (selectedSoftwareToolId) formData.append('softwareToolId', selectedSoftwareToolId);
    if (softwareRating) formData.append('softwareRating', String(softwareRating));
    if (selectedImage) formData.append('image', selectedImage);

    if (isPollMode) {
        const validOptions = pollOptions.filter(o => o.trim() !== '');
        if (validOptions.length < 2) {
            showSnackbar('Eine Umfrage benötigt mindestens 2 Optionen.', 'warning');
            setCreateLoading(false);
            return;
        }
        formData.append('pollOptions', JSON.stringify(validOptions));
    }

    try {
      const response = await apiClient.post('/api/community/feed', formData);
      setPosts([response.data, ...posts]);
      
      setNewContent(''); 
      setSelectedImage(null); 
      setSelectedCategory('');
      setSelectedSoftwareToolId('');
      setSoftwareRating(null);
      setIsPollMode(false);
      setPollOptions(['', '']);
      if (fileInputRef.current) fileInputRef.current.value = '';
      
      showSnackbar('Beitrag veröffentlicht! (+10 Punkte)', 'success');
    } catch (err: any) {
        showSnackbar(err.response?.data?.message || 'Fehler beim Veröffentlichen.', 'error');
    } finally { 
        setCreateLoading(false); 
    }
  };

  const handleDeletePost = async (postId: string) => {
      if (isDemo) return; 
      if(!window.confirm('Möchten Sie diesen Beitrag wirklich löschen?')) return;
      try {
          await apiClient.delete(`/api/community/feed/${postId}`);
          setPosts(posts.filter(p => p.id !== postId));
          if (detailPost?.id === postId) setDetailPost(null);
          showSnackbar('Gelöscht.', 'info');
      } catch (e) { showSnackbar('Fehler.', 'error'); }
  };

  // --- NEU: EDIT LOGIK ---
  const handleOpenEdit = (post: CommunityPost) => {
      setEditingPost(post);
      setEditContent(post.content);
      setEditCategoryId(post.category_id || '');
  };

  const handleSaveEdit = async () => {
      if (!editingPost) return;
      setIsSavingEdit(true);
      try {
          await apiClient.put(`/api/community/feed/${editingPost.id}`, {
              content: editContent,
              categoryId: editCategoryId
          });
          
          setPosts(posts.map(p => p.id === editingPost.id ? { ...p, content: editContent, category_id: editCategoryId, category_name: categories.find(c => c.id === editCategoryId)?.name } : p));
          if (detailPost?.id === editingPost.id) {
              setDetailPost(prev => prev ? { ...prev, content: editContent, category_id: editCategoryId, category_name: categories.find(c => c.id === editCategoryId)?.name } : null);
          }
          setEditingPost(null);
          showSnackbar('Beitrag aktualisiert.', 'success');
      } catch (err) {
          showSnackbar('Fehler beim Speichern.', 'error');
      } finally {
          setIsSavingEdit(false);
      }
  };

  const handleLike = async (postId: string) => {
    if (isDemo) return; 
    try {
        const res = await apiClient.post(`/api/community/feed/${postId}/like`);
        const isLikedNow = res.data.liked;
        
        const updateLogic = (p: CommunityPost) => {
            if (p.id === postId) {
                return { 
                    ...p, 
                    is_liked_by_me: isLikedNow, 
                    like_count: isLikedNow ? p.like_count + 1 : p.like_count - 1 
                };
            }
            return p;
        };

        setPosts(prev => prev.map(updateLogic));
        if (detailPost && detailPost.id === postId) setDetailPost(prev => prev ? updateLogic(prev) : null);
    } catch (e) { showSnackbar('Fehler.', 'error'); }
  };

  const handleVotePoll = async (optionId: string, postId: string) => {
      if (isDemo) return; 
      try {
          const res = await apiClient.post('/api/community/poll/vote', { optionId });
          const updatedOptions = res.data.options;
          
          const updateLogic = (p: CommunityPost) => {
              if (p.id === postId && p.poll_options) {
                  const newOpts = p.poll_options.map(opt => {
                      const serverOpt = updatedOptions.find((o: any) => o.id === opt.id);
                      return {
                          ...opt,
                          votes: serverOpt ? serverOpt.votes : opt.votes,
                          is_voted_by_me: opt.id === optionId
                      };
                  });
                  return { ...p, poll_options: newOpts };
              }
              return p;
          };

          setPosts(prev => prev.map(updateLogic));
          if (detailPost && detailPost.id === postId) setDetailPost(prev => prev ? updateLogic(prev) : null);
          showSnackbar('Stimme gezählt!', 'success');
      } catch (e) { showSnackbar('Fehler bei der Abstimmung.', 'error'); }
  };

  const toggleComments = async (postId: string) => {
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, commentsOpen: !p.commentsOpen } : p));
      
      const targetPost = posts.find(p => p.id === postId);
      if (targetPost && !targetPost.commentsOpen && !targetPost.comments) {
           try {
              const res = await apiClient.get(`/api/community/feed/${postId}/comments`);
              setPosts(prev => prev.map(p => p.id === postId ? { ...p, comments: res.data } : p));
          } catch (e) {}
      }
  };

  const handleCommentInputChange = (postId: string, value: string) => {
      setCommentInputs(prev => ({ ...prev, [postId]: value }));
  };

  const handleSendComment = async (postId: string, text: string) => {
      if (isDemo) return; 
      const cleanText = text.replace(/<[^>]*>?/gm, '').trim();
      if(!cleanText) return;
      try {
          const res = await apiClient.post(`/api/community/feed/${postId}/comments`, { content: text }); 
          const updateLogic = (p: CommunityPost) => {
              if (p.id === postId) return { ...p, comment_count: p.comment_count + 1, comments: [...(p.comments || []), res.data] };
              return p;
          };

          setPosts(prev => prev.map(updateLogic));
          if (detailPost && detailPost.id === postId) setDetailPost(prev => prev ? updateLogic(prev) : null);

          setCommentInputs(prev => ({ ...prev, [postId]: '' }));
          showSnackbar('Kommentar gesendet (+5 Punkte)', 'success');
      } catch (e) { showSnackbar('Fehler.', 'error'); }
  };

  const handleTogglePin = async (postId: string) => {
      if (isDemo) return; 
      try {
          const res = await apiClient.put(`/api/community/feed/${postId}/pin`);
          const newStatus = res.data.is_pinned;
          setPosts(prev => prev.map(p => p.id === postId ? { ...p, is_pinned: newStatus } : p)
              .sort((a, b) => (a.is_pinned === b.is_pinned ? new Date(b.created_at).getTime() - new Date(a.created_at).getTime() : a.is_pinned ? -1 : 1)));
          showSnackbar(newStatus ? 'Angepinnt.' : 'Gelöst.', 'success');
      } catch (e) { showSnackbar('Fehler.', 'error'); }
  };

  const handleReportPost = async (postId: string) => {
      if (isDemo) return; 
      const reason = window.prompt("Warum möchten Sie diesen Beitrag melden? (z.B. Spam, Beleidigung)");
      if (!reason) return;
      try {
          await apiClient.post('/api/community/report', { postId, reason });
          showSnackbar('Vielen Dank. Die Meldung wurde an die Moderation gesendet.', 'success');
      } catch (e) {
          showSnackbar('Fehler beim Senden der Meldung.', 'error');
      }
  };

  const handleProfileClick = (event: React.MouseEvent, userData: any) => {
    event.stopPropagation();
    const profileUserId = String(userData.author_id || userData.user_id || userData.id || '');
    const normalizedUser = {
        ...userData,
        id: profileUserId,
        role: userData.author_role || userData.role 
    };
    setSelectedUser(normalizedUser);
    setAnchorEl(event.currentTarget as HTMLElement);
    const requestId = ++profileRequestRef.current;

    if (!/^[0-9a-fA-F-]{36}$/.test(profileUserId)) {
        setProfileLoading(false);
        return;
    }

    setProfileLoading(true);
    apiClient.get(`/api/community/members/${encodeURIComponent(profileUserId)}/profile`)
        .then((response) => {
            if (profileRequestRef.current !== requestId) return;
            setSelectedUser({ ...normalizedUser, ...response.data, id: profileUserId });
        })
        .catch(() => {
            if (profileRequestRef.current === requestId) {
                showSnackbar('Die vollständigen Profildaten konnten nicht geladen werden.', 'warning');
            }
        })
        .finally(() => {
            if (profileRequestRef.current === requestId) setProfileLoading(false);
        });
  };
  
  const handlePopoverClose = () => {
    profileRequestRef.current += 1;
    setProfileLoading(false);
    setAnchorEl(null);
    setSelectedUser(null);
  };
  const popoverOpen = Boolean(anchorEl);

  // --- RENDER POST HELPER ---
  const renderPostCard = (post: CommunityPost, isDialog: boolean = false) => {
      const isMyPost = user?.id === post.author_id;

      return (
      <Card key={post.id} sx={{ mb: isDialog ? 0 : 3, borderRadius: isDialog ? 0 : 3, boxShadow: isDialog ? 'none' : theme.shadows[2], border: post.is_pinned ? `1px solid ${theme.palette.primary.main}` : 'none' }}>
        <CardHeader
            avatar={
                <UserAvatarWithStatus user={post} onClick={(e) => handleProfileClick(e, post)} />
            }
            action={
                <Box sx={{ display: 'flex', gap: 0.5 }}>
                    {!isMyPost && (
                        <Tooltip title={isDemo ? "Deaktiviert" : "Melden"}>
                            <span>
                                <IconButton onClick={() => handleReportPost(post.id)} size="small" disabled={isDemo}>
                                    <ReportProblemIcon fontSize="small" color="action" />
                                </IconButton>
                            </span>
                        </Tooltip>
                    )}
                    {(user?.role === 'admin' || user?.role === 'assistenz') && (
                        <Tooltip title={post.is_pinned ? "Loslösen" : "Anpinnen"}>
                            <IconButton onClick={() => handleTogglePin(post.id)} color={post.is_pinned ? "primary" : "default"} size="small" disabled={isDemo}>
                                {post.is_pinned ? <PushPinIcon fontSize="small" /> : <PushPinOutlinedIcon fontSize="small" />}
                            </IconButton>
                        </Tooltip>
                    )}
                    {(isMyPost || user?.role === 'admin') && (
                        <Tooltip title="Bearbeiten">
                            <IconButton onClick={() => handleOpenEdit(post)} size="small" disabled={isDemo}>
                                <EditIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                    )}
                    {(isMyPost || user?.role === 'admin') && (
                        <Tooltip title="Löschen">
                            <IconButton onClick={() => handleDeletePost(post.id)} size="small" disabled={isDemo}>
                                <DeleteIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                    )}
                </Box>
            }
            title={
                <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
                    <Typography fontWeight="bold" variant="subtitle2" sx={{ cursor: 'pointer', '&:hover': { color: 'primary.main'} }} onClick={(e) => handleProfileClick(e, post)}>
                        {post.first_name} {post.last_name}
                    </Typography>
                    {post.category_name && <Chip label={post.category_name} size="small" sx={{ height: 18, fontSize: '0.65rem', bgcolor: alpha(theme.palette.primary.main, 0.1), color: 'primary.dark' }} />}
                    {post.is_pinned && <Chip icon={<PushPinIcon style={{fontSize: 12}} />} label="Angepinnt" size="small" color="primary" sx={{ height: 18, fontSize: '0.65rem' }} />}
                </Box>
            }
            subheader={<Typography variant="caption" color="text.secondary">{safeFormatDistance(post.created_at)}</Typography>}
        />
        <CardContent sx={{ pt: 0, pb: 1, px: 3 }}>
            {post.software_tool_id && (
                <Paper variant="outlined" sx={{ p: 1.5, mb: 2, borderRadius: 2, bgcolor: alpha(theme.palette.primary.main, 0.035) }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={2}>
                        <Box sx={{ minWidth: 0 }}>
                            <Typography variant="subtitle2" fontWeight={900}>{post.software_tool_name}</Typography>
                            <Typography variant="caption" color="text.secondary">{post.software_provider_name}</Typography>
                            {post.software_rating && <Rating value={post.software_rating} readOnly size="small" sx={{ display: 'block', mt: 0.5 }} />}
                        </Box>
                        {post.software_tool_url && <Button size="small" href={post.software_tool_url} target="_blank" rel="noopener noreferrer">Produktseite</Button>}
                    </Stack>
                </Paper>
            )}
            <HTMLContentRenderer html={post.content} />
            
            {post.poll_options && post.poll_options.length > 0 && (
                <Box sx={{ mt: 3 }}>
                    {post.poll_options.map(opt => {
                        const totalVotes = post.poll_options!.reduce((acc, o) => acc + parseInt(o.votes as any), 0);
                        const percent = totalVotes > 0 ? Math.round((parseInt(opt.votes as any) / totalVotes) * 100) : 0;
                        const isVoted = opt.is_voted_by_me;

                        return (
                            <Box 
                                key={opt.id} 
                                sx={{ 
                                    mb: 1.5, p: 1.5, borderRadius: 2, cursor: isDemo ? 'default' : 'pointer', position: 'relative',
                                    border: isVoted ? `2px solid ${theme.palette.primary.main}` : '1px solid #e0e0e0',
                                    overflow: 'hidden',
                                    '&:hover': { bgcolor: isDemo ? 'transparent' : alpha(theme.palette.primary.main, 0.05) }
                                }}
                                onClick={() => !isDemo && handleVotePoll(opt.id, post.id)}
                            >
                                <Box sx={{ 
                                    position: 'absolute', top: 0, left: 0, bottom: 0, 
                                    width: `${percent}%`, bgcolor: isVoted ? alpha(theme.palette.primary.main, 0.2) : alpha(theme.palette.action.selected, 0.5), 
                                    zIndex: 0, transition: 'width 0.5s ease'
                                }} />
                                
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', position: 'relative', zIndex: 1, px: 1 }}>
                                    <Typography variant="body2" fontWeight={isVoted ? 'bold' : 'medium'}>{opt.text}</Typography>
                                    <Typography variant="body2" fontWeight="bold">{percent}% ({opt.votes})</Typography>
                                </Box>
                            </Box>
                        );
                    })}
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block', textAlign: 'right' }}>
                        Gesamt: {post.poll_options.reduce((acc, o) => acc + parseInt(o.votes as any), 0)} Stimmen
                    </Typography>
                </Box>
            )}
        </CardContent>
        {post.image_url && renderMedia(post.image_url)}
        <Divider sx={{ mx: 2, mt: 1 }} />
        <CardActions disableSpacing sx={{ px: 2, py: 1.5 }}>
            <Button size="small" startIcon={post.is_liked_by_me ? <ThumbUpIcon fontSize="small" /> : <ThumbUpOutlinedIcon fontSize="small" />} onClick={() => handleLike(post.id)} color={post.is_liked_by_me ? "primary" : "inherit"} disabled={isDemo} sx={{ borderRadius: 4, px: 2 }}>{post.like_count > 0 ? post.like_count : 'Gefällt mir'}</Button>
            {!isDialog && <Button size="small" startIcon={<CommentIcon fontSize="small" />} onClick={() => toggleComments(post.id)} color="inherit" sx={{ ml: 2, borderRadius: 4, px: 2 }}>{post.comment_count > 0 ? post.comment_count : 'Kommentieren'}</Button>}
        </CardActions>
        <Collapse in={isDialog || post.commentsOpen} timeout="auto" unmountOnExit>
            <Box sx={{ p: 2, bgcolor: theme.palette.mode === 'dark' ? 'action.hover' : alpha(theme.palette.primary.main, 0.02), borderTop: `1px solid ${theme.palette.divider}` }}>
                {post.comments?.map(c => (
                    <Box key={c.id} sx={{ display: 'flex', gap: 1.5, mb: 2 }}>
                        <UserAvatarWithStatus user={c} size={36} onClick={(e) => handleProfileClick(e, c)} />
                        
                        <Box sx={{ bgcolor: theme.palette.background.paper, p: 1.5, borderRadius: '0 16px 16px 16px', flexGrow: 1, boxShadow: theme.shadows[1], border: `1px solid ${theme.palette.divider}` }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mb: 0.5 }}>
                                <Typography variant="subtitle2" fontWeight="bold" sx={{ cursor: 'pointer', '&:hover': {color: 'primary.main'} }} onClick={(e) => handleProfileClick(e, c)}>
                                    {c.first_name} {c.last_name}
                                </Typography>
                                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>{safeFormatDistance(c.created_at)}</Typography>
                            </Box>
                            <HTMLContentRenderer html={c.content} />
                        </Box>
                    </Box>
                ))}
                <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start', mt: 3 }}>
                    {user && <UserAvatarWithStatus user={user as any} size={36} />}
                    <Box sx={{ flexGrow: 1, bgcolor: 'background.paper', borderRadius: 1 }}>
                        <div>
                            <ReactQuill 
                                theme="snow"
                                value={commentInputs[post.id] || ''}
                                onChange={(val) => handleCommentInputChange(post.id, val)}
                                modules={quillModules}
                                formats={quillFormats}
                                placeholder={isDemo ? "Kommentieren deaktiviert" : "Schreibe eine Antwort..."}
                                readOnly={isDemo}
                                style={{ height: 'auto', minHeight: '60px' }}
                            />
                        </div>
                    </Box>
                    <IconButton 
                        onClick={() => handleSendComment(post.id, commentInputs[post.id] || '')} 
                        color="primary" 
                        disabled={isDemo || !(commentInputs[post.id] || '').replace(/<[^>]*>?/gm, '').trim()}
                        sx={{ bgcolor: 'background.paper', border: `1px solid ${theme.palette.divider}`, '&:hover': {bgcolor: 'primary.light', color: 'white'} }}
                    >
                        <SendIcon />
                    </IconButton>
                </Box>
            </Box>
        </Collapse>
      </Card>
  )};

  if (loading) return <Box sx={{ p: 4, display: 'flex', justifyContent: 'center', minHeight: '50vh', alignItems: 'center' }}><CircularProgress /></Box>;

  return (
    <Container maxWidth="lg" sx={{ mt: 3, mb: 4, px: isMobile ? 1 : 3 }}>
      <Grid container spacing={isMobile ? 2 : 4}>
        
        {/* LINKS: Hauptinhalt (Feed, Mitglieder, Experten) */}
        <Grid item xs={12} md={8}>
          <Box sx={{ mb: 3 }}>
             <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant={isMobile ? 'h5' : 'h4'} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, fontWeight: 'bold' }}>
                    <GroupIcon fontSize="large" color="primary" /> Community
                </Typography>
             </Box>
             {isDemo && <Alert severity="info" sx={{ mb: 2, borderRadius: 2 }}>Im Demo-Modus sind Interaktionen (Posten, Liken, Kommentieren) deaktiviert.</Alert>}
             
             {/* Tabs */}
             <Paper sx={{ mb: 3, borderRadius: 3, overflow: 'hidden', boxShadow: theme.shadows[2] }}>
                 <Tabs 
                    value={currentTab} 
                    onChange={(_, val) => setCurrentTab(val)} 
                    variant="fullWidth" 
                    indicatorColor="primary" 
                    textColor="primary"
                    sx={{ '& .MuiTab-root': { py: 2, fontWeight: 'bold' } }}
                 >
                     <Tab icon={<DynamicFeedIcon />} iconPosition="start" label="Feed" value="feed" />
                     <Tab icon={<PersonSearchIcon />} iconPosition="start" label="Mitglieder" value="members" />
                     <Tab icon={<SchoolIcon />} iconPosition="start" label="Experten" value="experts" />
                 </Tabs>
             </Paper>
          </Box>

          {/* TAB: FEED */}
          {currentTab === 'feed' && (
            <Box sx={{ animation: 'fadeIn 0.3s ease-in-out' }}>
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
                    <FormControl size="small" sx={{ minWidth: 150, bgcolor: 'background.paper', borderRadius: 1 }}>
                        <InputLabel>Thema filtern</InputLabel>
                        <Select value={filterCategory} label="Thema filtern" onChange={(e) => setFilterCategory(e.target.value)}>
                            <MenuItem value="all">Alle Beiträge</MenuItem>
                            {categories.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
                        </Select>
                    </FormControl>
                </Box>

                {/* Create Post Area */}
                <Paper sx={{ p: isMobile ? 2 : 3, mb: 4, borderRadius: 3, boxShadow: theme.shadows[2] }}>
                    <Box sx={{ display: 'flex', gap: 2 }}>
                    {!isMobile && (
                        <Box sx={{ pt: 1 }}>
                            {user && <UserAvatarWithStatus user={user as any} size={48} onClick={() => navigate('/profile')} />}
                        </Box>
                    )}
                        <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
                            {/* FIX: Ein natives div blockt die findDOMNode-Warnung für äußere Komponenten */}
                            <div>
                                <ReactQuill 
                                    theme="snow"
                                    value={newContent} 
                                    onChange={setNewContent} 
                                    modules={quillModules}
                                    formats={quillFormats}
                                    placeholder={isDemo ? "Posten ist im Demo-Modus deaktiviert." : `Was möchten Sie der Community mitteilen, ${user?.first_name}?`} 
                                    readOnly={isDemo}
                                    style={{ height: '150px', marginBottom: '40px' }} // Platz für die Toolbar
                                />
                            </div>
                        
                            {isPollMode && (
                                <Box sx={{ mt: 2, p: 2, border: `1px solid ${theme.palette.divider}`, borderRadius: 2, bgcolor: alpha(theme.palette.primary.main, 0.02) }}>
                                    <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <PollIcon fontSize="small" color="primary"/> Umfrage erstellen:
                                    </Typography>
                                    {pollOptions.map((opt, idx) => (
                                        <TextField 
                                            key={idx} 
                                            placeholder={`Antwortmöglichkeit ${idx + 1}`} 
                                            value={opt}
                                            onChange={(e) => {
                                                const newOpts = [...pollOptions];
                                                newOpts[idx] = e.target.value;
                                                setPollOptions(newOpts);
                                            }}
                                            fullWidth size="small" sx={{ mb: 1.5, bgcolor: 'background.paper' }}
                                            disabled={isDemo}
                                        />
                                    ))}
                                    <Button size="small" startIcon={<AddIcon />} onClick={() => setPollOptions([...pollOptions, ''])} disabled={isDemo}>Weitere Option hinzufügen</Button>
                                </Box>
                            )}

                            <Box sx={{ display: 'flex', mt: 1, gap: 2 }}>
                                <FormControl fullWidth size="small" disabled={isDemo}>
                                    <InputLabel>Kategorie zuordnen *</InputLabel>
                                    <Select value={selectedCategory} label="Kategorie zuordnen *" onChange={(e) => setSelectedCategory(e.target.value)} sx={{ bgcolor: 'background.paper' }}>
                                        {categories.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
                                    </Select>
                                </FormControl>
                            </Box>

                            <Paper variant="outlined" sx={{ mt: 1, p: 1.5, borderRadius: 2 }}>
                                <Typography variant="subtitle2" fontWeight={900} sx={{ mb: 1 }}>Software-Erfahrung oder Hinweis (optional)</Typography>
                                <Grid container spacing={1.5} alignItems="center">
                                    <Grid item xs={12} sm={8}>
                                        <FormControl fullWidth size="small" disabled={isDemo}>
                                            <InputLabel>Software auswählen</InputLabel>
                                            <Select
                                                value={selectedSoftwareToolId}
                                                label="Software auswählen"
                                                onChange={(e) => {
                                                    const softwareId = e.target.value;
                                                    setSelectedSoftwareToolId(softwareId);
                                                    setSoftwareRating(null);
                                                    if (softwareId) {
                                                        const softwareCategory = categories.find(c => c.name.toLowerCase() === 'software & tools');
                                                        if (softwareCategory) setSelectedCategory(softwareCategory.id);
                                                    }
                                                }}
                                            >
                                                <MenuItem value=""><em>Keine Software-Zuordnung</em></MenuItem>
                                                {softwareOptions.map(option => <MenuItem key={option.id} value={option.id}>{option.provider_name} · {option.name}</MenuItem>)}
                                            </Select>
                                        </FormControl>
                                    </Grid>
                                    <Grid item xs={12} sm={4}>
                                        <Stack direction="row" alignItems="center" spacing={1}>
                                            <Typography variant="caption" color="text.secondary">Bewertung</Typography>
                                            <Rating value={softwareRating} disabled={!selectedSoftwareToolId || isDemo} onChange={(_, value) => setSoftwareRating(value)} />
                                        </Stack>
                                    </Grid>
                                </Grid>
                                <Typography variant="caption" color="text.secondary">Der Beitrag erscheint automatisch in „Software & Tools“. Öffentlich werden nur Anzahl und Bewertungsdurchschnitt gezeigt.</Typography>
                            </Paper>

                            {selectedImage && (
                                <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 1, bgcolor: alpha(theme.palette.info.main, 0.1), p: 1.5, borderRadius: 2, border: `1px solid ${theme.palette.info.light}` }}>
                                    <ImageIcon fontSize="small" color="info" />
                                    <Typography variant="body2" fontWeight="medium" noWrap sx={{ maxWidth: 200, flexGrow: 1 }}>{selectedImage.name}</Typography>
                                    <IconButton size="small" onClick={() => {setSelectedImage(null); if(fileInputRef.current) fileInputRef.current.value='';}}>
                                        <DeleteIcon fontSize="small" color="error" />
                                    </IconButton>
                                </Box>
                            )}
                            
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1, pt: 2, borderTop: `1px solid ${theme.palette.divider}` }}>
                                <Box sx={{ display: 'flex', gap: 1 }}>
                                    <Tooltip title="Bild/Video anhängen">
                                        <IconButton onClick={() => fileInputRef.current?.click()} size="small" sx={{ bgcolor: 'action.hover', color: 'text.secondary' }} disabled={isDemo}>
                                            <ImageIcon />
                                        </IconButton>
                                    </Tooltip>
                                    <Tooltip title="Umfrage erstellen">
                                        <IconButton 
                                            onClick={() => setIsPollMode(!isPollMode)} 
                                            size="small" 
                                            sx={{ bgcolor: isPollMode ? 'primary.main' : 'action.hover', color: isPollMode ? 'white' : 'text.secondary', '&:hover': { bgcolor: isPollMode ? 'primary.dark' : undefined } }}
                                            disabled={isDemo}
                                        >
                                            <PollIcon />
                                        </IconButton>
                                    </Tooltip>
                                </Box>
                                <input type="file" hidden ref={fileInputRef} accept="image/*,video/mp4,video/webm,video/quicktime" onChange={(e) => e.target.files && setSelectedImage(e.target.files[0])} />
                                
                                <Button 
                                    variant="contained" 
                                    onClick={handleCreatePost} 
                                    disabled={createLoading || isDemo} 
                                    endIcon={createLoading ? <CircularProgress size={20} color="inherit" /> : <SendIcon />}
                                    sx={{ borderRadius: 8, px: 3, fontWeight: 'bold' }}
                                >
                                    Veröffentlichen
                                </Button>
                            </Box>
                        </Box>
                    </Box>
                </Paper>

                {/* Posts List */}
                {posts.map((post) => renderPostCard(post))}
                {posts.length === 0 && (
                    <Box sx={{ textAlign: 'center', py: 8, opacity: 0.6 }}>
                        <DynamicFeedIcon sx={{ fontSize: 60, color: 'text.disabled', mb: 2 }} />
                        <Typography variant="h6" color="text.secondary">Noch keine Beiträge vorhanden.</Typography>
                        <Typography variant="body2" color="text.secondary">Sei der Erste, der etwas in dieser Kategorie teilt!</Typography>
                    </Box>
                )}
            </Box>
          )}

          {/* TAB: MEMBERS & EXPERTS (Unverändert übernommen) */}
          {currentTab === 'members' && (
             <Paper sx={{ p: isMobile ? 2 : 4, borderRadius: 3, boxShadow: theme.shadows[2], animation: 'fadeIn 0.3s ease-in-out' }}>
                 <Box sx={{ mb: 4 }}>
                    <Typography variant="h6" fontWeight="bold" gutterBottom>Kollegen finden</Typography>
                    <TextField 
                        fullWidth 
                        placeholder="Nach Name oder Firma suchen..." 
                        variant="outlined" 
                        value={memberSearch} 
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMemberSearch(e.target.value)} 
                        InputProps={{ 
                            startAdornment: (<InputAdornment position="start"><SearchIcon color="action" /></InputAdornment>),
                            sx: { borderRadius: 2, bgcolor: 'background.default' }
                        }} 
                    />
                 </Box>
                 {membersLoading ? <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box> : members.length === 0 ? <Typography variant="body1" color="text.secondary" textAlign="center" py={4}>Keine Mitglieder gefunden.</Typography> : (
                    <List disablePadding>
                        {members.map((member, index) => (
                            <React.Fragment key={member.id}>
                                <ListItem alignItems="center" sx={{ px: 1, py: 2, borderRadius: 2, '&:hover': { bgcolor: 'action.hover' } }}>
                                <ListItemAvatar sx={{ minWidth: 64 }}>
                                    <UserAvatarWithStatus user={member as any} size={isMobile ? 48 : 56} onClick={(e) => handleProfileClick(e, member)} />
                                </ListItemAvatar>
                                    <ListItemText
                                        primary={
                                            <Typography variant="subtitle1" fontWeight="bold" sx={{ cursor: 'pointer', '&:hover': {color: 'primary.main'} }} onClick={(e) => handleProfileClick(e, member)}>
                                                {member.first_name} {member.last_name} 
                                                {member.membership_level && <Chip label={member.membership_level} size="small" color="primary" variant="outlined" sx={{ ml: 1.5, height: 20, fontSize: '0.7rem' }} />}
                                            </Typography>
                                        }
                                        secondary={
                                            <Box component="span" sx={{ display: 'block' }}>
                                                <CommunityProfileDetails profile={member} />
                                                <Typography component="span" variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                                                    <StarsIcon fontSize="small" color="warning" /> {member.contribution_score} Community-Punkte
                                                </Typography>
                                            </Box>
                                        }
                                    />
                                    <Button variant="outlined" size="small" onClick={(e) => handleProfileClick(e, member)} sx={{ borderRadius: 6, display: { xs: 'none', sm: 'flex' } }}>Profil</Button>
                                </ListItem>
                                {index < members.length - 1 && <Divider component="li" sx={{ my: 1 }} />}
                            </React.Fragment>
                        ))}
                    </List>
                 )}
             </Paper>
          )}

          {currentTab === 'experts' && (
             <Paper sx={{ p: isMobile ? 2 : 4, borderRadius: 3, boxShadow: theme.shadows[2], animation: 'fadeIn 0.3s ease-in-out' }}>
                 <Box sx={{ mb: 4 }}>
                    <Typography variant="h5" fontWeight="bold" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <SchoolIcon color="primary" fontSize="large" /> Wissen & Netzwerk
                    </Typography>
                    <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
                        Suchen Sie nach bestimmten Kompetenzen, Branchen oder Stichwörtern, um den passenden Ansprechpartner in der Community zu finden.
                    </Typography>
                    
                    <form onSubmit={handleExpertSearchSubmit}>
                        <Box sx={{ 
                            display: 'flex', 
                            gap: 1, 
                            width: '100%',
                            flexDirection: { xs: 'column', sm: 'row' }
                        }}>
                            <TextField 
                                fullWidth 
                                placeholder="Z.B. Elektromobilität, Förderung, Ladeinfrastruktur..." 
                                variant="outlined" 
                                value={expertSearch} 
                                onChange={(e) => setExpertSearch(e.target.value)} 
                                InputProps={{ 
                                    startAdornment: (<InputAdornment position="start"><SearchIcon color="primary" /></InputAdornment>),
                                    sx: { borderRadius: 3, bgcolor: 'background.default' }
                                }} 
                            />
                            <Button 
                                type="submit" 
                                variant="contained" 
                                size="large" 
                                disabled={expertsLoading} 
                                sx={{ 
                                    borderRadius: 3, 
                                    px: 4, 
                                    minWidth: { sm: 140 },
                                    height: { sm: 'auto' },
                                    py: { xs: 1.5, sm: 0 },
                                    fontWeight: 'bold',
                                    boxShadow: theme.shadows[2],
                                    '&:hover': { boxShadow: theme.shadows[4] }
                                }}
                            >
                                Suchen
                            </Button>
                        </Box>
                    </form>

                    <Box sx={{ mt: 3, p: 2, bgcolor: alpha(theme.palette.primary.main, 0.03), borderRadius: 2, border: `1px solid ${alpha(theme.palette.primary.main, 0.1)}` }}>
                        <Typography variant="subtitle2" fontWeight="bold" color="text.primary" sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                            <LocalOfferIcon fontSize="small" color="primary" /> Mein hinterlegtes Wissen:
                        </Typography>
                        
                        {userTags && userTags.length > 0 ? (
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                                {userTags.map(tag => (
                                    <Chip 
                                        key={tag} 
                                        label={tag} 
                                        onClick={() => {
                                            setExpertSearch(tag);
                                            fetchExperts(tag);
                                        }}
                                        sx={{ 
                                            cursor: 'pointer', 
                                            bgcolor: 'background.paper', 
                                            border: `1px solid ${theme.palette.divider}`,
                                            fontWeight: 500,
                                            '&:hover': { bgcolor: 'primary.main', color: 'white', borderColor: 'primary.main' } 
                                        }}
                                    />
                                ))}
                            </Box>
                        ) : (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                                <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                                    Sie haben noch keine Kompetenzen in Ihrem Profil hinterlegt.
                                </Typography>
                                <Button 
                                    size="small" 
                                    variant="outlined" 
                                    startIcon={<SettingsSuggestIcon />}
                                    onClick={() => navigate('/profile')}
                                    sx={{ borderRadius: 4, textTransform: 'none' }}
                                >
                                    Jetzt Themen hinzufügen
                                </Button>
                            </Box>
                        )}
                    </Box>
                 </Box>

                 <Divider sx={{ mb: 3 }} />

                 {expertsLoading ? (
                     <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}><CircularProgress /></Box>
                 ) : experts.length > 0 ? (
                    <List disablePadding>
                        {experts.map((expert, index) => (
                            <React.Fragment key={expert.id}>
                                <ListItem alignItems="flex-start" sx={{ px: 2, py: 3, borderRadius: 2, '&:hover': { bgcolor: alpha(theme.palette.action.hover, 0.5) } }}>
                                    <ListItemAvatar sx={{ minWidth: 70 }}>
                                        <UserAvatarWithStatus user={expert as any} size={isMobile ? 50 : 60} onClick={(e) => handleProfileClick(e, expert)} />
                                    </ListItemAvatar>
                                    <ListItemText
                                        primary={
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 0.5 }}>
                                                <Typography variant="h6" fontWeight="bold" sx={{ cursor: 'pointer', '&:hover': { color: 'primary.main'} }} onClick={(e) => handleProfileClick(e, expert)}>
                                                    {expert.first_name} {expert.last_name}
                                                </Typography>
                                                {expert.membership_level && <Chip label={expert.membership_level} size="small" color="secondary" sx={{ height: 20, fontSize: '0.7rem', fontWeight: 'bold' }} />}
                                            </Box>
                                        }
                                        secondary={<CommunityProfileDetails profile={expert} />}
                                    />
                                    <Button 
                                        size="small" 
                                        variant="contained" 
                                        onClick={(e) => handleProfileClick(e, expert)}
                                        sx={{ ml: 2, borderRadius: 6, display: { xs: 'none', sm: 'flex' }, boxShadow: 'none' }}
                                    >
                                        Profil
                                    </Button>
                                </ListItem>
                                {index < experts.length - 1 && <Divider component="li" sx={{ my: 1 }} />}
                            </React.Fragment>
                        ))}
                    </List>
                 ) : expertSearch && (
                    <Box sx={{ textAlign: 'center', mt: 6, opacity: 0.6 }}>
                        <PersonSearchIcon sx={{ fontSize: 60, color: 'text.disabled', mb: 2 }} />
                        <Typography variant="h6" color="text.secondary">
                            Keine passenden Experten gefunden.
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                            Probieren Sie es mit einem anderen Suchbegriff oder breiteren Kategorien.
                        </Typography>
                    </Box>
                 )}
             </Paper>
          )}
        </Grid>

        {/* RECHTS: Sidebar (Stats, Leaderboard) */}
        {!isMobile && (
        <Grid item md={4}>
            
            <Paper sx={{ p: 3, mb: 4, borderRadius: 3, bgcolor: theme.palette.primary.main, color: 'white', position: 'relative', overflow: 'hidden', boxShadow: theme.shadows[4] }}>
                {/* Dekorativer Hintergrundkreis */}
                <Box sx={{ position: 'absolute', top: -30, right: -20, width: 120, height: 120, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.1)' }} />
                
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, position: 'relative', zIndex: 1 }}>
                    {user && <UserAvatarWithStatus user={user as any} size={60} onClick={() => navigate('/profile')} />}
                    <Box>
                        <Typography variant="subtitle2" sx={{ opacity: 0.9, textTransform: 'uppercase', letterSpacing: 1 }}>Mein Status</Typography>
                        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                            <Typography variant="h3" fontWeight="900">{user?.contribution_score || 0}</Typography>
                            <Typography variant="body2" sx={{ opacity: 0.9 }}>Punkte</Typography>
                        </Box>
                    </Box>
                </Box>
            </Paper>
            
            {/* LEADERBOARD */}
            <Paper sx={{ p: 3, mb: 4, borderRadius: 3, boxShadow: theme.shadows[2] }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                    <Typography variant="h6" fontWeight="bold" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <StarsIcon sx={{ color: '#ffd700', fontSize: 28 }} /> Top Mitglieder
                    </Typography>
                    
                    <Tooltip 
                        title={
                            <Box sx={{ p: 1 }}>
                                <Typography variant="subtitle2" fontWeight="bold" gutterBottom>So funktioniert's:</Typography>
                                <ul style={{ paddingLeft: 16, margin: 0 }}>
                                    <li><b>+10</b> für eigene Beiträge</li>
                                    <li><b>+5</b> für Kommentare</li>
                                    <li><b>+1</b> für Likes / Umfragen</li>
                                    <li>Wird ein Inhalt gelöscht, werden die Punkte wieder abgezogen.</li>
                                </ul>
                            </Box>
                        } 
                        arrow
                    >
                        <IconButton size="small" sx={{ color: 'text.secondary' }}>
                            <InfoOutlinedIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                </Box>
                
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mt: 3 }}>
                    {leaderboard.map((lbUser, index) => (
                        <Box 
                            key={lbUser.id} 
                            sx={{ 
                                display: 'flex', alignItems: 'center', gap: 2, cursor: 'pointer', p: 1.5, borderRadius: 2,
                                border: index < 3 ? `1px solid ${index === 0 ? '#ffd700' : index === 1 ? '#c0c0c0' : '#cd7f32'}` : '1px solid transparent',
                                bgcolor: index < 3 ? alpha(index === 0 ? '#ffd700' : index === 1 ? '#c0c0c0' : '#cd7f32', 0.05) : 'transparent',
                                '&:hover': { bgcolor: 'action.hover' }
                            }} 
                            onClick={(e) => handleProfileClick(e, lbUser)}
                        >
                            <Box sx={{ width: 24, textAlign: 'center' }}>
                                <Typography variant="body1" fontWeight="bold" sx={{ color: index === 0 ? '#ffd700' : index === 1 ? '#c0c0c0' : index === 2 ? '#cd7f32' : 'text.disabled' }}>
                                    #{index + 1}
                                </Typography>
                            </Box>
                            <UserAvatarWithStatus user={lbUser as any} size={44} />
                            <Box sx={{ overflow: 'hidden', flexGrow: 1 }}>
                                <Typography variant="body2" fontWeight="bold" noWrap>
                                    {lbUser.first_name || lbUser.last_name ? `${lbUser.first_name || ''} ${lbUser.last_name || ''}`.trim() : (lbUser.username || 'Unbekannt')}
                                </Typography>
                                <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                    {lbUser.contribution_score} Punkte {lbUser.membership_level && `• ${lbUser.membership_level}`}
                                </Typography>
                            </Box>
                        </Box>
                    ))}
                </Box>
            </Paper>

            {/* AKTUELLE DISKUSSIONEN */}
            <Paper sx={{ p: 3, mb: 3, borderRadius: 3, boxShadow: theme.shadows[2] }}>
                <Typography variant="h6" fontWeight="bold" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <ChatBubbleOutlineIcon color="primary" /> Aktuelle Diskussionen
                </Typography>
                <List disablePadding sx={{ mt: 2 }}>
                    {recentComments.length === 0 ? (
                        <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', py: 2 }}>Noch keine Kommentare.</Typography>
                    ) : (
                        recentComments.map((comment, idx) => (
                            <React.Fragment key={comment.id}>
                                <ListItem 
                                    alignItems="flex-start" 
                                    sx={{ px: 1, py: 1.5, borderRadius: 2, '&:hover': { bgcolor: 'action.hover' } }}
                                    button
                                    onClick={() => handleOpenPostDetail(comment.post_id)}
                                >
                                    <ListItemAvatar sx={{ minWidth: 48 }}>
                                        <UserAvatarWithStatus user={comment as any} size={36} onClick={(e) => handleProfileClick(e, comment as any)} />
                                    </ListItemAvatar>
                                    <ListItemText
                                        primary={
                                            <Box component="span" sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                                                <Typography variant="body2" noWrap sx={{ fontWeight: 'bold', cursor: 'pointer' }} onClick={(e) => handleProfileClick(e, comment as any)}>
                                                    {comment.first_name}
                                                </Typography>
                                                <Typography variant="caption" color="text.disabled">{safeFormatDistance(comment.created_at)}</Typography>
                                            </Box>
                                        }
                                        secondary={
                                            <Typography variant="body2" color="text.secondary" sx={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.4 }}>
                                                {/* Purify the comment snippet just in case */}
                                                <span dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(comment.content || '').substring(0, 50) + '...' }} />
                                            </Typography>
                                        }
                                    />
                                </ListItem>
                                {idx < recentComments.length - 1 && <Divider variant="middle" component="li" />}
                            </React.Fragment>
                        ))
                    )}
                </List>
            </Paper>
        </Grid>
        )}
      </Grid>

      {/* VISITING CARD POPOVER */}
      <Popover
        open={popoverOpen}
        anchorEl={anchorEl}
        onClose={handlePopoverClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        transformOrigin={{ vertical: 'top', horizontal: 'center' }}
        PaperProps={{
            sx: { borderRadius: 4, overflow: 'hidden', width: 320, maxWidth: '95vw', boxShadow: theme.shadows[8] }
        }}
      >
        {profileLoading && <LinearProgress />}
        {selectedUser && (
            <ProfileCard user={selectedUser as UserProfileData} />
        )}
      </Popover>

      {/* DETAIL POST DIALOG */}
      <Dialog 
        open={!!detailPost} 
        onClose={() => setDetailPost(null)} 
        fullWidth 
        maxWidth="md"
        PaperProps={{ sx: { borderRadius: 3, bgcolor: 'background.default' } }}
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1, bgcolor: 'background.paper', borderBottom: `1px solid ${theme.palette.divider}` }}>
            <Typography variant="h6" fontWeight="bold">Beitrag ansehen</Typography>
            <IconButton onClick={() => setDetailPost(null)} sx={{ bgcolor: 'action.hover' }}><CloseIcon /></IconButton>
        </DialogTitle>
        <DialogContent sx={{ p: {xs: 1, md: 3} }}>
            {detailPost && renderPostCard(detailPost, true)}
        </DialogContent>
      </Dialog>

      {/* EDIT POST DIALOG */}
      <Dialog 
        open={!!editingPost} 
        onClose={() => setEditingPost(null)} 
        fullWidth 
        maxWidth="sm"
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle>Beitrag bearbeiten</DialogTitle>
            <DialogContent dividers>
                <div>
                    <ReactQuill 
                        theme="snow"
                        value={editContent} 
                        onChange={setEditContent} 
                        modules={quillModules}
                        formats={quillFormats}
                        style={{ height: '200px', marginBottom: '50px' }}
                    />
                </div>
                <FormControl fullWidth size="small" sx={{ mt: 2 }}>
                <InputLabel>Kategorie</InputLabel>
                <Select value={editCategoryId} label="Kategorie" onChange={(e) => setEditCategoryId(e.target.value)}>
                    {categories.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
                </Select>
            </FormControl>
        </DialogContent>
        <DialogActions>
            <Button onClick={() => setEditingPost(null)}>Abbrechen</Button>
            <Button variant="contained" onClick={handleSaveEdit} disabled={isSavingEdit}>
                {isSavingEdit ? 'Speichert...' : 'Speichern'}
            </Button>
        </DialogActions>
      </Dialog>

    </Container>
  );
};

export default CommunityPage;
