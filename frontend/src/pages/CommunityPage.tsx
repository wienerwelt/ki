import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Container, Grid, Paper, Typography, Box, Avatar, Button,
  Card, CardHeader, CardContent, CardMedia, CardActions, IconButton,
  Divider, CircularProgress, Tooltip, Chip, useTheme, useMediaQuery,
  MenuItem, Select, FormControl, InputLabel, Collapse, Popover,
  Tabs, Tab, List, ListItem, ListItemAvatar, ListItemText, InputAdornment,
  TextField, Badge
} from '@mui/material';
import { useLocation } from 'react-router-dom';

// Icons
import SendIcon from '@mui/icons-material/Send';
import ImageIcon from '@mui/icons-material/Image';
import ThumbUpIcon from '@mui/icons-material/ThumbUp';
import ThumbUpOutlinedIcon from '@mui/icons-material/ThumbUpOutlined';
import CommentIcon from '@mui/icons-material/Comment';
import DeleteIcon from '@mui/icons-material/Delete';
import StarsIcon from '@mui/icons-material/Stars';
import GroupIcon from '@mui/icons-material/Group';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import PushPinIcon from '@mui/icons-material/PushPin';
import PushPinOutlinedIcon from '@mui/icons-material/PushPinOutlined';
import DynamicFeedIcon from '@mui/icons-material/DynamicFeed';
import PersonSearchIcon from '@mui/icons-material/PersonSearch';
import SearchIcon from '@mui/icons-material/Search';
import LinkedInIcon from '@mui/icons-material/LinkedIn';
import EventIcon from '@mui/icons-material/Event';
import ReportProblemIcon from '@mui/icons-material/ReportProblem';
import PollIcon from '@mui/icons-material/Poll';

// App Context & Utils
import { useAuth } from '../context/AuthContext';
import apiClient from '../apiClient';
import { useSnackbar } from '../context/SnackbarContext';
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';

// Components
import MentionInput from '../components/MentionInput';

// --- TYPES ---
interface UserProfileData {
    id: string;
    first_name: string;
    last_name: string;
    username?: string;
    profile_image_url: string | null;
    membership_level?: string;
    organization_name?: string;
    role?: string;
    linkedin_url?: string;
    member_since?: string;
    contribution_score?: number;
    last_login_at?: string;
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
    content: string;
    image_url: string | null;
    created_at: string;
    category_name?: string;
    author_id: string;
    like_count: number;
    comment_count: number;
    is_liked_by_me: boolean;
    comments?: Comment[]; 
    commentsOpen?: boolean;
    is_pinned: boolean;
    author_role?: string;
    poll_options?: PollOption[];
}

interface Category { id: string; name: string; }
interface LeaderboardUser extends UserProfileData {}
interface Member extends UserProfileData {
    email: string;
    last_login_at?: string;
}

// --- HELPER: Text with Mentions ---
const ContentWithMentions: React.FC<{ text: string }> = ({ text }) => {
    if (!text) return null;
    const parts = text.split(/(@[a-zA-Z0-9_.-]+)/g);
    return (
        <Typography variant="body1" style={{ whiteSpace: 'pre-wrap' }}>
            {parts.map((part, i) => 
                part.startsWith('@') ? (
                    <Typography component="span" key={i} color="primary" fontWeight="bold">
                        {part}
                    </Typography>
                ) : part
            )}
        </Typography>
    );
};

// Status-Logik
const getUserStatus = (lastLoginDate?: string) => {
    if (!lastLoginDate) return 'offline';
    const loginTime = new Date(lastLoginDate).getTime();
    const now = new Date().getTime();
    const diffMinutes = (now - loginTime) / (1000 * 60);
    
    if (diffMinutes < 15) return 'online';
    if (diffMinutes < 60 * 24) return 'active_today';
    return 'offline';
};

// Komponente für den Avatar mit Status-Punkt
// KORREKTUR: Typ von onClick auf React.MouseEvent geändert (nicht HTMLElement spezifisch)
const UserAvatarWithStatus: React.FC<{ user: UserProfileData, size?: number, onClick?: (e: React.MouseEvent) => void }> = ({ user, size = 40, onClick }) => {
    const status = getUserStatus(user.last_login_at);
    
    // KORREKTUR: Unbenutzte Variable 'color' entfernt. Die Logik ist direkt im Badge.
    
    const tooltip = status === 'online' ? 'Online' : (status === 'active_today' ? 'War heute aktiv' : '');
    const invisible = status === 'offline';

    return (
        <Tooltip title={tooltip}>
            <Badge
                overlap="circular"
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                variant="dot"
                color={status === 'online' ? 'success' : 'warning'}
                invisible={invisible}
                sx={{
                    '& .MuiBadge-badge': {
                        backgroundColor: status === 'online' ? '#44b700' : '#ffa726',
                        color: status === 'online' ? '#44b700' : '#ffa726',
                        boxShadow: `0 0 0 2px white`,
                        '&::after': status === 'online' ? {
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            height: '100%',
                            borderRadius: '50%',
                            animation: 'ripple 1.2s infinite ease-in-out',
                            border: '1px solid currentColor',
                            content: '""',
                        } : {},
                    },
                    '@keyframes ripple': {
                        '0%': { transform: 'scale(.8)', opacity: 1 },
                        '100%': { transform: 'scale(2.4)', opacity: 0 },
                    },
                    cursor: onClick ? 'pointer' : 'default'
                }}
            >
                <Avatar 
                    src={user.profile_image_url || undefined} 
                    sx={{ width: size, height: size }} 
                    onClick={onClick}
                >
                    {user.first_name?.charAt(0)}
                </Avatar>
            </Badge>
        </Tooltip>
    );
};


const CommunityPage: React.FC = () => {
  const { user, businessPartner } = useAuth();
  const { showSnackbar } = useSnackbar();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const location = useLocation();

  // --- STATE ---
  const [currentTab, setCurrentTab] = useState<'feed' | 'members'>('feed');
  
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCategory, setFilterCategory] = useState('all');
  
  const [members, setMembers] = useState<Member[]>([]);
  const [memberSearch, setMemberSearch] = useState('');
  const [membersLoading, setMembersLoading] = useState(false);

  // Popover State
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [selectedUser, setSelectedUser] = useState<UserProfileData | null>(null);

  // Post Creation State
  const [createLoading, setCreateLoading] = useState(false);
  const [newContent, setNewContent] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  
  const [isPollMode, setIsPollMode] = useState(false);
  const [pollOptions, setPollOptions] = useState(['', '']);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [commentInputs, setCommentInputs] = useState<{ [postId: string]: string }>({});

  // --- LOADING ---
  const loadFeedData = useCallback(async () => {
    try {
        const [postsRes, catRes, lbRes] = await Promise.all([
            apiClient.get(`/api/community/feed?limit=20&categoryId=${filterCategory}`),
            apiClient.get('/api/community/categories'),
            apiClient.get('/api/community/leaderboard')
        ]);
        setPosts(postsRes.data);
        setCategories(catRes.data);
        setLeaderboard(lbRes.data);
    } catch (err) {
        console.error(err);
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
        console.error(e);
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

  useEffect(() => {
    if (location.state && (location.state as any).defaultTab) {
        setCurrentTab((location.state as any).defaultTab);
    }
  }, [location]);


  // --- ACTIONS ---
  const handleCreatePost = async () => {
    if (!newContent.trim() && !selectedImage && (!isPollMode || pollOptions.every(o => !o.trim()))) return;
    if (!selectedCategory) { showSnackbar('Bitte wähle eine Kategorie.', 'warning'); return; }

    setCreateLoading(true);
    const formData = new FormData();
    formData.append('content', newContent);
    formData.append('categoryId', selectedCategory);
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
      setIsPollMode(false);
      setPollOptions(['', '']);

      if (fileInputRef.current) fileInputRef.current.value = '';
      
      showSnackbar('Beitrag veröffentlicht! (+5 Punkte)', 'success');
    } catch (err) { 
        console.error(err);
        showSnackbar('Fehler beim Veröffentlichen.', 'error'); 
    } finally { 
        setCreateLoading(false); 
    }
  };

  const handleDeletePost = async (postId: string) => {
      if(!window.confirm('Möchten Sie diesen Beitrag wirklich löschen?')) return;
      try {
          await apiClient.delete(`/api/community/feed/${postId}`);
          setPosts(posts.filter(p => p.id !== postId));
          showSnackbar('Gelöscht.', 'info');
      } catch (e) { showSnackbar('Fehler.', 'error'); }
  };

  const handleLike = async (postId: string) => {
    try {
        const res = await apiClient.post(`/api/community/feed/${postId}/like`);
        const isLikedNow = res.data.liked;
        setPosts(prev => prev.map(p => {
            if (p.id === postId) {
                return { 
                    ...p, 
                    is_liked_by_me: isLikedNow, 
                    like_count: isLikedNow ? p.like_count + 1 : p.like_count - 1 
                };
            }
            return p;
        }));
    } catch (e) { showSnackbar('Fehler.', 'error'); }
  };

  const handleVotePoll = async (optionId: string, postId: string) => {
      try {
          const res = await apiClient.post('/api/community/poll/vote', { optionId });
          const updatedOptions = res.data.options;
          
          setPosts(prev => prev.map(p => {
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
          }));
          
          showSnackbar('Stimme gezählt!', 'success');
      } catch (e) { showSnackbar('Fehler bei der Abstimmung.', 'error'); }
  };

  const toggleComments = async (postId: string) => {
      const postIndex = posts.findIndex(p => p.id === postId);
      if (postIndex === -1) return;
      const newPosts = [...posts];
      const post = newPosts[postIndex];

      if (post.commentsOpen) {
          post.commentsOpen = false;
          setPosts(newPosts);
      } else {
          if (!post.comments) {
              try {
                  const res = await apiClient.get(`/api/community/feed/${postId}/comments`);
                  post.comments = res.data;
              } catch (e) { return; }
          }
          post.commentsOpen = true;
          setPosts(newPosts);
      }
  };

  const handleCommentInputChange = (postId: string, value: string) => {
      setCommentInputs(prev => ({ ...prev, [postId]: value }));
  };

  const handleSendComment = async (postId: string, text: string) => {
      if(!text.trim()) return;
      try {
          const res = await apiClient.post(`/api/community/feed/${postId}/comments`, { content: text });
          setPosts(prev => prev.map(p => {
              if (p.id === postId) {
                  return { ...p, comment_count: p.comment_count + 1, comments: [...(p.comments || []), res.data] };
              }
              return p;
          }));
          setCommentInputs(prev => ({ ...prev, [postId]: '' }));
          showSnackbar('Kommentar gesendet (+2 Punkte)', 'success');
      } catch (e) { showSnackbar('Fehler.', 'error'); }
  };

  const handleTogglePin = async (postId: string) => {
      try {
          const res = await apiClient.put(`/api/community/feed/${postId}/pin`);
          const newStatus = res.data.is_pinned;
          setPosts(prev => prev.map(p => p.id === postId ? { ...p, is_pinned: newStatus } : p)
              .sort((a, b) => (a.is_pinned === b.is_pinned ? new Date(b.created_at).getTime() - new Date(a.created_at).getTime() : a.is_pinned ? -1 : 1)));
          showSnackbar(newStatus ? 'Angepinnt.' : 'Gelöst.', 'success');
      } catch (e) { showSnackbar('Fehler.', 'error'); }
  };

  const handleReportPost = async (postId: string) => {
      const reason = window.prompt("Warum möchten Sie diesen Beitrag melden? (z.B. Spam, Beleidigung)");
      if (!reason) return;
      try {
          await apiClient.post('/api/community/report', { postId, reason });
          showSnackbar('Vielen Dank. Die Meldung wurde an die Moderation gesendet.', 'success');
      } catch (e) {
          showSnackbar('Fehler beim Senden der Meldung.', 'error');
      }
  };

  // --- PROFIL POPOVER (KORREKTUR: Typ React.MouseEvent) ---
  const handleProfileClick = (event: React.MouseEvent, userData: any) => {
    event.stopPropagation();
    const normalizedUser = {
        ...userData,
        role: userData.author_role || userData.role 
    };
    setSelectedUser(normalizedUser);
    setAnchorEl(event.currentTarget as HTMLElement);
  };
  const handlePopoverClose = () => {
    setAnchorEl(null);
    setSelectedUser(null);
  };
  const popoverOpen = Boolean(anchorEl);

  const renderMedia = (url: string) => {
      const isVideo = url.match(/\.(mp4|webm|mov)$/i);
      if (isVideo) return <Box sx={{ bgcolor: 'black', display: 'flex', justifyContent: 'center', py: 1 }}><video controls src={url} style={{ maxHeight: 500, maxWidth: '100%' }} /></Box>;
      return <CardMedia component="img" image={url} alt="Post attachment" sx={{ maxHeight: 500, objectFit: 'contain', bgcolor: '#f0f0f0' }} />;
  };

  if (loading) return <Box sx={{ p: 4, display: 'flex', justifyContent: 'center' }}><CircularProgress /></Box>;

  return (
    <Container maxWidth="lg" sx={{ mt: 2, mb: 4, px: isMobile ? 1 : 2 }}>
      <Grid container spacing={isMobile ? 1 : 3}>
        
        <Grid item xs={12} md={8}>
          <Box sx={{ mb: 2 }}>
             <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <Typography variant={isMobile ? 'h5' : 'h4'} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <GroupIcon fontSize={isMobile ? "medium" : "large"} color="primary" /> Community
                </Typography>
             </Box>
             <Paper sx={{ mb: 2, overflow: 'hidden' }}>
                 <Tabs value={currentTab} onChange={(_, val) => setCurrentTab(val)} variant="fullWidth" indicatorColor="primary" textColor="primary">
                     <Tab icon={<DynamicFeedIcon />} iconPosition="start" label="Feed" value="feed" />
                     <Tab icon={<PersonSearchIcon />} iconPosition="start" label="Mitglieder" value="members" />
                 </Tabs>
             </Paper>
          </Box>

          {currentTab === 'feed' && (
            <>
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
                    <FormControl size="small" sx={{ minWidth: 120 }}>
                        <InputLabel>Thema</InputLabel>
                        <Select value={filterCategory} label="Thema" onChange={(e) => setFilterCategory(e.target.value)}>
                            <MenuItem value="all">Alle</MenuItem>
                            {categories.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
                        </Select>
                    </FormControl>
                </Box>

                <Paper sx={{ p: isMobile ? 2 : 3, mb: 3, borderRadius: 2 }} elevation={1}>
                    <Box sx={{ display: 'flex', gap: 2 }}>
                    {!isMobile && (
                        <Box>
                            {user && <UserAvatarWithStatus user={user as any} size={48} />}
                        </Box>
                    )}
                    <Box sx={{ flexGrow: 1 }}>
                        <MentionInput value={newContent} onChange={setNewContent} placeholder={`Was gibt's Neues, ${user?.first_name}?`} />
                        
                        {isPollMode && (
                            <Box sx={{ mt: 2, p: 2, border: '1px solid #eee', borderRadius: 1 }}>
                                <Typography variant="caption" fontWeight="bold" sx={{ mb: 1, display: 'block' }}>Umfrage Optionen:</Typography>
                                {pollOptions.map((opt, idx) => (
                                    <TextField 
                                        key={idx} 
                                        placeholder={`Option ${idx + 1}`} 
                                        value={opt}
                                        onChange={(e) => {
                                            const newOpts = [...pollOptions];
                                            newOpts[idx] = e.target.value;
                                            setPollOptions(newOpts);
                                        }}
                                        fullWidth size="small" sx={{ mb: 1 }}
                                    />
                                ))}
                                <Button size="small" onClick={() => setPollOptions([...pollOptions, ''])}>+ Option</Button>
                            </Box>
                        )}

                        <Box sx={{ display: 'flex', mt: 2, gap: 2 }}>
                            <FormControl fullWidth size="small">
                                <InputLabel>Kategorie *</InputLabel>
                                <Select value={selectedCategory} label="Kategorie *" onChange={(e) => setSelectedCategory(e.target.value)}>
                                    {categories.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
                                </Select>
                            </FormControl>
                        </Box>
                        {selectedImage && <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 1, bgcolor: '#f5f5f5', p: 1, borderRadius: 1 }}><ImageIcon fontSize="small" color="action" /><Typography variant="caption" noWrap sx={{ maxWidth: 200 }}>{selectedImage.name}</Typography><IconButton size="small" onClick={() => {setSelectedImage(null); if(fileInputRef.current) fileInputRef.current.value='';}}><DeleteIcon fontSize="small" color="error" /></IconButton></Box>}
                        
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 2 }}>
                            <Box sx={{ display: 'flex', gap: 1 }}>
                                <IconButton onClick={() => fileInputRef.current?.click()} size="small" color="inherit"><ImageIcon /></IconButton>
                                <IconButton 
                                    onClick={() => setIsPollMode(!isPollMode)} 
                                    size="small" 
                                    color={isPollMode ? "primary" : "inherit"}
                                >
                                    <PollIcon />
                                </IconButton>
                            </Box>
                            <input type="file" hidden ref={fileInputRef} accept="image/*,video/mp4,video/webm,video/quicktime" onChange={(e) => e.target.files && setSelectedImage(e.target.files[0])} />
                            <Button variant="contained" onClick={handleCreatePost} disabled={createLoading} endIcon={createLoading ? <CircularProgress size={20} color="inherit" /> : <SendIcon />}>Posten</Button>
                        </Box>
                    </Box>
                    </Box>
                </Paper>

                {posts.map((post) => (
                  <Card key={post.id} sx={{ mb: 2, borderRadius: 2 }}>
                    <CardHeader
                        avatar={
                            // ✅ KORREKTUR: Typ angepasst
                            <UserAvatarWithStatus user={post} onClick={(e) => handleProfileClick(e, post)} />
                        }
                        action={
                            <Box sx={{ display: 'flex', gap: 0.5 }}>
                                <Tooltip title="Melden">
                                    <IconButton onClick={() => handleReportPost(post.id)} size="small">
                                        <ReportProblemIcon fontSize="small" color="action" />
                                    </IconButton>
                                </Tooltip>
                                {(user?.role === 'admin' || user?.role === 'assistenz') && (
                                    <Tooltip title={post.is_pinned ? "Loslösen" : "Anpinnen"}>
                                        <IconButton onClick={() => handleTogglePin(post.id)} color={post.is_pinned ? "primary" : "default"} size="small">
                                            {post.is_pinned ? <PushPinIcon fontSize="small" /> : <PushPinOutlinedIcon fontSize="small" />}
                                        </IconButton>
                                    </Tooltip>
                                )}
                                {(user?.id === post.author_id || user?.role === 'admin') && <IconButton onClick={() => handleDeletePost(post.id)} size="small"><DeleteIcon fontSize="small" /></IconButton>}
                            </Box>
                        }
                        title={
                            <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0.5 }}>
                                <Typography fontWeight="bold" variant="subtitle2" sx={{ cursor: 'pointer' }} onClick={(e) => handleProfileClick(e, post)}>{post.first_name} {post.last_name}</Typography>
                                {post.category_name && <Chip label={post.category_name} size="small" variant="outlined" sx={{ height: 18, fontSize: '0.65rem' }} />}
                                {post.is_pinned && <Chip icon={<PushPinIcon style={{fontSize: 12}} />} label="Pin" size="small" color="primary" sx={{ height: 18, fontSize: '0.65rem', '& .MuiChip-label': { px: 0.5 } }} />}
                            </Box>
                        }
                        subheader={<Typography variant="caption" color="text.secondary">{formatDistanceToNow(new Date(post.created_at), { addSuffix: true, locale: de })}</Typography>}
                    />
                    <CardContent sx={{ pt: 0, pb: 1 }}>
                        <ContentWithMentions text={post.content} />
                        
                        {post.poll_options && post.poll_options.length > 0 && (
                            <Box sx={{ mt: 2 }}>
                                {post.poll_options.map(opt => {
                                    const totalVotes = post.poll_options!.reduce((acc, o) => acc + parseInt(o.votes as any), 0);
                                    const percent = totalVotes > 0 ? Math.round((parseInt(opt.votes as any) / totalVotes) * 100) : 0;
                                    const isVoted = opt.is_voted_by_me;

                                    return (
                                        <Box 
                                            key={opt.id} 
                                            sx={{ 
                                                mb: 1, p: 1, borderRadius: 1, cursor: 'pointer', position: 'relative',
                                                border: isVoted ? `1px solid ${theme.palette.primary.main}` : '1px solid #eee',
                                                overflow: 'hidden',
                                                '&:hover': { bgcolor: 'action.hover' }
                                            }}
                                            onClick={() => handleVotePoll(opt.id, post.id)}
                                        >
                                            <Box sx={{ 
                                                position: 'absolute', top: 0, left: 0, bottom: 0, 
                                                width: `${percent}%`, bgcolor: isVoted ? 'primary.light' : 'action.selected', 
                                                opacity: 0.3, zIndex: 0, transition: 'width 0.5s ease'
                                            }} />
                                            
                                            <Box sx={{ display: 'flex', justifyContent: 'space-between', position: 'relative', zIndex: 1, px: 1 }}>
                                                <Typography variant="body2" fontWeight={isVoted ? 'bold' : 'normal'}>{opt.text}</Typography>
                                                <Typography variant="caption" fontWeight="bold">{percent}% ({opt.votes})</Typography>
                                            </Box>
                                        </Box>
                                    );
                                })}
                                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block', textAlign: 'right' }}>
                                    {post.poll_options.reduce((acc, o) => acc + parseInt(o.votes as any), 0)} Stimmen
                                </Typography>
                            </Box>
                        )}
                    </CardContent>
                    {post.image_url && renderMedia(post.image_url)}
                    <Divider />
                    <CardActions disableSpacing sx={{ px: 2, py: 1 }}>
                        <Button size="small" startIcon={post.is_liked_by_me ? <ThumbUpIcon fontSize="small" /> : <ThumbUpOutlinedIcon fontSize="small" />} onClick={() => handleLike(post.id)} color={post.is_liked_by_me ? "primary" : "inherit"}>{post.like_count > 0 ? post.like_count : 'Gefällt'}</Button>
                        <Button size="small" startIcon={<CommentIcon fontSize="small" />} onClick={() => toggleComments(post.id)} color="inherit" sx={{ ml: 2 }}>{post.comment_count > 0 ? post.comment_count : 'Kommentieren'}</Button>
                    </CardActions>
                    <Collapse in={post.commentsOpen} timeout="auto" unmountOnExit>
                        <Box sx={{ p: 1.5, bgcolor: theme.palette.mode === 'dark' ? 'action.hover' : '#f9f9f9', borderTop: `1px solid ${theme.palette.divider}` }}>
                            {post.comments?.map(c => (
                                <Box key={c.id} sx={{ display: 'flex', gap: 1.5, mb: 2 }}>
                                    {/* ✅ KORREKTUR: Typ angepasst */}
                                    <UserAvatarWithStatus user={c} size={32} onClick={(e) => handleProfileClick(e, c)} />
                                    
                                    <Box sx={{ bgcolor: theme.palette.background.paper, p: 1, borderRadius: 2, flexGrow: 1, boxShadow: 1 }}>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                            <Typography variant="subtitle2" fontWeight="bold" sx={{ cursor: 'pointer', fontSize: '0.85rem' }} onClick={(e) => handleProfileClick(e, c)}>
                                                {c.first_name} {c.last_name}
                                            </Typography>
                                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>{formatDistanceToNow(new Date(c.created_at), { locale: de })}</Typography>
                                        </Box>
                                        <Typography variant="body2" sx={{ fontSize: '0.9rem' }}><ContentWithMentions text={c.content} /></Typography>
                                    </Box>
                                </Box>
                            ))}
                            <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start', mt: 1 }}>
                                {user && <UserAvatarWithStatus user={user as any} size={32} />}
                                <Box sx={{ flexGrow: 1 }}>
                                    <MentionInput 
                                        value={commentInputs[post.id] || ''} 
                                        onChange={(val) => handleCommentInputChange(post.id, val)} 
                                        placeholder="Antwort..." 
                                        onKeyDown={(e) => { 
                                            if (e.key === 'Enter' && !e.shiftKey) { 
                                                e.preventDefault(); 
                                                handleSendComment(post.id, commentInputs[post.id] || ''); 
                                            } 
                                        }} 
                                    />
                                </Box>
                            </Box>
                        </Box>
                    </Collapse>
                  </Card>
                ))}
            </>
          )}

          {currentTab === 'members' && (
             <Paper sx={{ p: isMobile ? 2 : 3, borderRadius: 2 }}>
                 <Box sx={{ mb: 2 }}>
                    <TextField 
                        fullWidth 
                        size="small"
                        placeholder="Mitglieder suchen..." 
                        variant="outlined" 
                        value={memberSearch} 
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMemberSearch(e.target.value)} 
                        InputProps={{ startAdornment: (<InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>) }} 
                    />
                 </Box>
                 {membersLoading ? <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box> : members.length === 0 ? <Typography variant="body2" color="text.secondary" textAlign="center">Keine Mitglieder gefunden.</Typography> : (
                    <List disablePadding>
                        {members.map((member, index) => (
                            <React.Fragment key={member.id}>
                                <ListItem alignItems="flex-start" sx={{ px: 0 }}>
                                <ListItemAvatar>
                                    {/* ✅ KORREKTUR: Typ angepasst */}
                                    <UserAvatarWithStatus user={member} size={isMobile ? 40 : 50} onClick={(e) => handleProfileClick(e, member)} />
                                </ListItemAvatar>
                                    <ListItemText
                                        primary={<Typography variant="subtitle2" fontWeight="bold">{member.first_name} {member.last_name} {member.membership_level && <Chip label={member.membership_level} size="small" color="primary" variant="outlined" sx={{ ml: 1, height: 18, fontSize: '0.65rem' }} />}</Typography>}
                                        secondary={
                                            <React.Fragment>
                                                <Typography component="span" variant="caption" color="text.primary" display="block">{member.role} {member.organization_name ? `bei ${member.organization_name}` : ''}</Typography>
                                                <Typography component="span" variant="caption" color="text.secondary">{member.contribution_score} Punkte</Typography>
                                            </React.Fragment>
                                        }
                                    />
                                </ListItem>
                                {index < members.length - 1 && <Divider component="li" />}
                            </React.Fragment>
                        ))}
                    </List>
                 )}
             </Paper>
          )}
        </Grid>

        {!isMobile && (
        <Grid item md={4}>
            <Paper sx={{ p: 3, mb: 3, borderRadius: 2, bgcolor: theme.palette.primary.main, color: theme.palette.primary.contrastText }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    {user && <UserAvatarWithStatus user={user as any} size={56} />}
                    <Box>
                        <Typography variant="subtitle1" fontWeight="bold">Mein Status</Typography>
                        <Typography variant="h4" fontWeight="bold">{user?.contribution_score || 0}</Typography>
                        <Typography variant="caption" sx={{ opacity: 0.8 }}>Punkte gesamt</Typography>
                    </Box>
                </Box>
            </Paper>
            <Paper sx={{ p: 3, mb: 3, borderRadius: 2 }}>
                <Typography variant="h6" gutterBottom>Info</Typography>
                <Typography variant="body2" color="text.secondary" paragraph>Willkommen im Hub von <strong>{businessPartner?.name}</strong>.</Typography>
                <Divider sx={{ my: 2 }} />
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><StarsIcon color="warning" fontSize="small" /><Typography variant="subtitle2">Punkte sammeln</Typography></Box>
                <Box sx={{ mt: 1, pl: 4 }}>
                    <Typography variant="caption" display="block">• Beitrag: <strong>+5</strong></Typography>
                    <Typography variant="caption" display="block">• Kommentar: <strong>+2</strong></Typography>
                    <Typography variant="caption" display="block">• Like: <strong>+1</strong></Typography>
                </Box>
            </Paper>
            <Paper sx={{ p: 3, borderRadius: 2 }}>
                <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><StarsIcon sx={{ color: '#ffd700' }} /> Top Mitglieder</Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
                    {leaderboard.map((lbUser, index) => (
                        <Box key={lbUser.id} sx={{ display: 'flex', alignItems: 'center', gap: 2, cursor: 'pointer' }} onClick={(e) => handleProfileClick(e, lbUser)}>
                            <Avatar sx={{ bgcolor: index === 0 ? '#ffd700' : index === 1 ? '#c0c0c0' : index === 2 ? '#cd7f32' : theme.palette.action.selected, width: 24, height: 24, fontSize: '0.8rem', color: index < 3 ? 'black' : 'inherit', fontWeight: 'bold' }}>{index + 1}</Avatar>
                            {/* ✅ KORREKTUR: Typ angepasst */}
                            <UserAvatarWithStatus user={lbUser} size={40} />
                            <Box sx={{ overflow: 'hidden' }}>
                                <Typography variant="body2" fontWeight="bold" noWrap>
                                    {lbUser.first_name || lbUser.last_name ? `${lbUser.first_name || ''} ${lbUser.last_name || ''}`.trim() : (lbUser.username || 'Unbekannt')}
                                    {lbUser.membership_level && <Typography component="span" variant="caption" sx={{ color: 'text.secondary', ml: 0.5, fontWeight: 'normal' }}>({lbUser.membership_level})</Typography>}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">{lbUser.contribution_score} Punkte</Typography>
                            </Box>
                        </Box>
                    ))}
                </Box>
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
      >
        {selectedUser && (
            <Box sx={{ p: 0, width: 360, maxWidth: '90vw' }}>
                <Box sx={{ height: 80, bgcolor: 'primary.main', opacity: 0.8 }}></Box>
                <Box sx={{ px: 3, pb: 3, mt: -5 }}>
                    {/* ✅ KORREKTUR: Typ angepasst */}
                    <UserAvatarWithStatus user={selectedUser} size={80} />
                    
                    <Box sx={{ mt: 1 }}>
                        <Typography variant="h6" fontWeight="bold">{selectedUser.first_name} {selectedUser.last_name}</Typography>
                        <Typography variant="body2" color="text.secondary" gutterBottom>{selectedUser.role || 'Mitglied'} {selectedUser.organization_name && ` • ${selectedUser.organization_name}`}</Typography>
                        {selectedUser.membership_level && <Chip icon={<VerifiedUserIcon fontSize="small" />} label={selectedUser.membership_level} size="small" color="secondary" variant="outlined" sx={{ mt: 0.5 }} />}
                    </Box>
                    <Divider sx={{ my: 2 }} />
                    <Grid container spacing={2}>
                        <Grid item xs={6}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary' }}><EventIcon fontSize="small" /><Box><Typography variant="caption" display="block">Dabei seit</Typography><Typography variant="body2" fontWeight="medium">{selectedUser.member_since ? new Date(selectedUser.member_since).toLocaleDateString('de-DE', {month: 'short', year: 'numeric'}) : '-'}</Typography></Box></Box>
                        </Grid>
                        <Grid item xs={6}>
                             <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary' }}><StarsIcon fontSize="small" color="warning" /><Box><Typography variant="caption" display="block">Punkte</Typography><Typography variant="body2" fontWeight="medium">{selectedUser.contribution_score || 0}</Typography></Box></Box>
                        </Grid>
                    </Grid>
                    {selectedUser.linkedin_url && <Box sx={{ mt: 3 }}><Button variant="outlined" startIcon={<LinkedInIcon />} fullWidth href={selectedUser.linkedin_url} target="_blank">LinkedIn Profil</Button></Box>}
                </Box>
            </Box>
        )}
      </Popover>
    </Container>
  );
};

export default CommunityPage;