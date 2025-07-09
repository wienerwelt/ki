import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    Box, Typography, TextField, CircularProgress, MenuItem, Alert, List, ListItem, ListItemIcon, ListItemText, Divider,
    Dialog, DialogTitle, DialogContent, Chip, Badge, Button, Grid, Stack, IconButton, Tooltip, Link as MuiLink,
    Accordion, AccordionSummary, AccordionDetails, DialogActions, Pagination, Paper, InputAdornment
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SendIcon from '@mui/icons-material/Send';
import CloseIcon from '@mui/icons-material/Close';
import ArrowDropUpIcon from '@mui/icons-material/ArrowDropUp';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import PersonIcon from '@mui/icons-material/Person';
import GroupsIcon from '@mui/icons-material/Groups';
import EmailIcon from '@mui/icons-material/Email';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import LinkIcon from '@mui/icons-material/Link';
import LanguageIcon from '@mui/icons-material/Language';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import { Autocomplete } from '@mui/material';
import WidgetPaper from './WidgetPaper';
import { BaseWidgetProps, Region } from '../../types/dashboard.types';
import apiClient from '../../apiClient';
import { useAuth } from '../../context/AuthContext';
import ClickAwayListener from '@mui/material/ClickAwayListener';

// --- Interfaces ---
interface ContentItem {
    id: string;
    title: string;
    summary: string | null;
    is_read: boolean;
    published_date: string;
    relevance_score: number;
    original_url?: string | null;
    origin: 'personal_subscription' | 'popular' | 'system_generated';
}
interface AIPromptRule { id: string; name: string; default_category_id?: string; }
interface GenericAIWidgetProps extends BaseWidgetProps { title: string; category: string; icon?: React.ReactNode; }
interface EmailState { open: boolean; loading: boolean; error: string | null; subject: string; body: string; }

// --- Hilfskomponenten ---
const ArticleBodyRenderer: React.FC<{ summary: string | null | undefined }> = ({ summary }) => {
    if (!summary) return <Typography>Kein Inhalt verfügbar.</Typography>;
    const sourcesSeparatorRegex = /(\n\s*Quellen:?\s*\n)/i;
    const parts = summary.split(sourcesSeparatorRegex);
    const mainContent = parts[0];
    const sourcesBlock = parts.length > 1 ? parts.slice(1).join('') : null;
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const renderTextWithLinks = (text: string) => {
        const textParts = text.split(urlRegex);
        return textParts.map((part, index) => {
            if (part.match(urlRegex)) return <MuiLink href={part} target="_blank" rel="noopener noreferrer" key={index}>{part}</MuiLink>;
            return part;
        });
    };
    return (
        <>
            <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>{renderTextWithLinks(mainContent)}</Typography>
            {sourcesBlock && (
                <Box sx={{ mt: 3, pt: 2, borderTop: 1, borderColor: 'divider' }}>
                    {sourcesBlock.split('\n').filter(line => line.trim() !== '').map((line, index) => {
                        if (/^Quellen:?$/i.test(line.trim())) return <Typography key={index} variant="overline" color="text.secondary" component="div" sx={{ mb: 1 }}>{line}</Typography>;
                        return <Box key={index} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}><LinkIcon fontSize="small" color="action" /><Typography variant="body2" component="div">{renderTextWithLinks(line)}</Typography></Box>;
                    })}
                </Box>
            )}
        </>
    );
};

const VoteComponent: React.FC<{ item: ContentItem; onVote: (vote: 1 | -1) => void }> = ({ item, onVote }) => {
    const getScoreColor = (score: number) => score > 0 ? 'success.main' : score < 0 ? 'error.main' : 'text.secondary';
    return (
        <Paper variant="outlined" sx={{ display: 'inline-flex', alignItems: 'center', borderRadius: 5, p: 0.5, backgroundColor: 'action.hover' }}>
            <Tooltip title="Hilfreich"><IconButton size="small" onClick={(e) => { e.stopPropagation(); onVote(1); }}><ArrowDropUpIcon sx={{ color: 'success.dark' }} /></IconButton></Tooltip>
            <Typography variant="body2" sx={{ fontWeight: 'bold', color: getScoreColor(item.relevance_score), minWidth: 24, textAlign: 'center', transition: 'transform 0.2s ease-in-out', '&:hover': { transform: 'scale(1.1)' } }}>{item.relevance_score}</Typography>
            <Tooltip title="Nicht hilfreich"><IconButton size="small" onClick={(e) => { e.stopPropagation(); onVote(-1); }}><ArrowDropDownIcon sx={{ color: 'error.main' }} /></IconButton></Tooltip>
        </Paper>
    );
};

const AnimatedSearchBar: React.FC<{ onSearch: (term: string) => void }> = ({ onSearch }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isExpanded) {
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    }, [isExpanded]);

    const handleToggle = () => {
        if (isExpanded) {
            setSearchTerm('');
            onSearch('');
        }
        setIsExpanded((prev) => !prev);
    };

    const handleClickAway = () => {
        if (isExpanded) setIsExpanded(false);
    };

    const handleClear = (event: React.MouseEvent) => {
        event.stopPropagation();
        setSearchTerm('');
        onSearch('');
        inputRef.current?.focus();
    };

    return (
        <ClickAwayListener onClickAway={handleClickAway}>
            <Box sx={{ display: 'flex', alignItems: 'center', height: '40px' }}>
                <Box
                    sx={{
                        display: 'flex',
                        alignItems: 'center',
                        bgcolor: isExpanded ? 'action.hover' : 'transparent',
                        borderRadius: 40,
                        width: isExpanded ? 180 : 32,
                        transition: 'width 0.3s cubic-bezier(.6,-0.28,.74,.05), background-color 0.3s cubic-bezier(.6,-0.28,.74,.05)',
                    }}
                >
                    <Tooltip title={isExpanded ? "Suche schließen" : "Suchen"}>
                        <IconButton onClick={handleToggle} size="small" sx={{ ml: '4px' }}>
                            {isExpanded ? <CloseIcon fontSize="small" /> : <SearchIcon />}
                        </IconButton>
                    </Tooltip>
                    <Box sx={{ width: '100%', overflow: 'hidden' }}>
                        <TextField
                            variant="standard"
                            fullWidth
                            value={searchTerm}
                            onChange={(e) => {
                                setSearchTerm(e.target.value);
                                onSearch(e.target.value);
                            }}
                            placeholder="Suchen..."
                            inputRef={inputRef}
                            sx={{
                                opacity: isExpanded ? 1 : 0,
                                transition: 'opacity 0.2s cubic-bezier(.6,-0.28,.74,.05)',
                                pl: 1,
                                pr: 1
                            }}
                            InputProps={{
                                disableUnderline: true,
                                endAdornment: (
                                    searchTerm && isExpanded ? (
                                        <InputAdornment position="end">
                                            <IconButton
                                                size="small"
                                                aria-label="Löschen"
                                                onClick={handleClear}
                                                edge="end"
                                            >
                                                <ClearIcon fontSize="small" />
                                            </IconButton>
                                        </InputAdornment>
                                    ) : null
                                )
                            }}
                        />
                    </Box>
                </Box>
            </Box>
        </ClickAwayListener>
    );
};

const GenericAIWidget: React.FC<GenericAIWidgetProps> = ({ onDelete, widgetId, isRemovable, title, category, icon }) => {
    const { user } = useAuth();
    const [items, setItems] = useState<ContentItem[]>([]);
    const [counts, setCounts] = useState({ unread: 0, new: 0 });
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedArticle, setSelectedArticle] = useState<ContentItem | null>(null);
    const [relevantRules, setRelevantRules] = useState<AIPromptRule[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
    const [selectedRuleId, setSelectedRuleId] = useState('');
    const [selectedRegion, setSelectedRegion] = useState<Region | null>(null);
    const [keywords, setKeywords] = useState<string[]>([]);
    const [emailState, setEmailState] = useState<EmailState>({ open: false, loading: false, error: null, subject: '', body: '' });
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(0);
    
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');

    useEffect(() => {
        const handler = setTimeout(() => { setDebouncedSearchTerm(searchTerm); }, 500);
        return () => { clearTimeout(handler); };
    }, [searchTerm]);

    useEffect(() => {
        // KORRIGIERT: Wendet die gleiche Logik wie im EVStationWidget an,
        // um die als Standard markierte Region zu finden und zu setzen.
        if (user?.regions && user.regions.length > 0) {
            const defaultRegion = user.regions.find(r => !!r.is_default);
            setSelectedRegion(defaultRegion || user.regions[0]);
        }
    }, [user?.regions]);

    useEffect(() => {
        if (relevantRules.length === 1) setSelectedRuleId(relevantRules[0].id);
        else setSelectedRuleId('');
    }, [relevantRules]);

    const fetchData = useCallback(async (currentPage: number, search: string) => {
        if (!category || !selectedRegion) {
            setItems([]);
            setTotalPages(0);
            return;
        }
        setIsLoading(true);
        setError(null);
        try {
            const token = localStorage.getItem('jwt_token');
            const params = new URLSearchParams({ category, region: selectedRegion.name, page: String(currentPage), limit: '5' });
            if (search) params.append('search', search);
            
            const contentUrl = `/api/data/ai-content?${params.toString()}`;
            const [rulesRes, contentRes, categoriesRes] = await Promise.all([
                apiClient.get('/api/data/ai-prompt-rules', { headers: { 'x-auth-token': token } }),
                apiClient.get(contentUrl, { headers: { 'x-auth-token': token } }),
                apiClient.get('/api/data/categories', { headers: { 'x-auth-token': token } }),
            ]);

            const currentCategory = categoriesRes.data.find((c: any) => c.name === category);
            if (currentCategory) setRelevantRules(rulesRes.data.filter((r: any) => r.default_category_id === currentCategory.id));
            
            setItems(contentRes.data?.data || []);
            setCounts(contentRes.data?.counts || { unread: 0, new: 0 });
            setTotalPages(contentRes.data?.totalPages || 0);
        } catch (err: any) {
            setError(err.response?.data?.message || `Inhalte für "${category}" konnten nicht geladen werden.`);
        } finally {
            setIsLoading(false);
        }
    }, [category, selectedRegion]);

    useEffect(() => { setPage(1); }, [selectedRegion, debouncedSearchTerm]);
    useEffect(() => { fetchData(page, debouncedSearchTerm); }, [fetchData, page, debouncedSearchTerm]);
    const handleOpenArticle = async (article: ContentItem) => {
        setSelectedArticle(article);
        if (!article.is_read) {
            try {
                const token = localStorage.getItem('jwt_token');
                await apiClient.post(`/api/data/content/${article.id}/mark-as-read`, {}, { headers: { 'x-auth-token': token } });
                setItems(prev => prev.map(n => n.id === article.id ? { ...n, is_read: true } : n));
                setCounts(prev => ({ ...prev, unread: Math.max(0, prev.unread - 1) }));
            } catch (err) { console.error("Fehler beim Markieren als gelesen:", err); }
        }
    };
    const handleCloseDialog = () => setSelectedArticle(null);
    const handleVote = async (contentId: string, vote: 1 | -1) => {
        const token = localStorage.getItem('jwt_token');
        try {
            const res = await apiClient.post(`/api/data/content/${contentId}/vote`, { vote, contentType: 'ai_content' }, { headers: { 'x-auth-token': token } });
            const newScore = res.data.relevance_score;
            setItems(prev => prev.map(item => item.id === contentId ? { ...item, relevance_score: newScore } : item));
            if (selectedArticle?.id === contentId) setSelectedArticle(prev => prev ? { ...prev, relevance_score: newScore } : null);
        } catch (err) { console.error("Fehler bei der Abstimmung:", err); }
    };
    const handleSubmitSubscription = async () => {
        if (!selectedRuleId || !selectedRegion || keywords.length === 0) {
            setSubmitError("Analyse-Typ, eine spezifische Region und Keywords sind für ein Abo erforderlich.");
            return;
        }
        setIsSubmitting(true);
        setSubmitError(null);
        setSubmitSuccess(null);
        try {
            const token = localStorage.getItem('jwt_token');
            await apiClient.post('/api/admin/subscriptions', { ruleId: selectedRuleId, region: selectedRegion.name, keywords }, { headers: { 'x-auth-token': token } });
            setSubmitSuccess(`Ihr Abonnement wurde gespeichert.`);
            setKeywords([]);
            setTimeout(() => fetchData(1, debouncedSearchTerm), 5000);
        } catch (err: any) {
            setSubmitError(err.response?.data?.message || 'Fehler beim Speichern.');
        } finally {
            setIsSubmitting(false);
        }
    };
    const handleGenerateEmail = async () => {
        if (!selectedArticle) return;
        setEmailState({ ...emailState, loading: true, open: true, error: null });
        try {
            const token = localStorage.getItem('jwt_token');
            const response = await apiClient.post('/api/data/generate-email', { content: selectedArticle.summary, title: selectedArticle.title }, { headers: { 'x-auth-token': token } });
            setEmailState({ open: true, loading: false, error: null, subject: response.data.subject, body: response.data.body });
        } catch (err: any) {
            setEmailState({ ...emailState, open: true, loading: false, error: err.response?.data?.message || 'E-Mail konnte nicht generiert werden.' });
        }
    };
    const handleCloseEmailDialog = () => setEmailState({ ...emailState, open: false });
    const handleCopyToClipboard = (text: string) => navigator.clipboard.writeText(text);
    const handleKeywordsChange = (event: React.SyntheticEvent, newValue: string[]) => {
        const processedKeywords = newValue.map(kw => kw.charAt(0).toUpperCase() + kw.slice(1));
        setKeywords([...new Set(processedKeywords)]);
    };
    const getOriginProps = (origin: ContentItem['origin']) => {
        switch (origin) {
            case 'personal_subscription': return { text: 'Persönlich für Sie', icon: <PersonIcon fontSize="inherit" color="primary" />, tooltip: 'Dieser Inhalt wurde aufgrund Ihrer abonnierten "Hot Topics" generiert.' };
            case 'popular': return { text: 'Interessiert andere', icon: <GroupsIcon fontSize="inherit" color="action" />, tooltip: 'Dieser Inhalt wurde von anderen Nutzern abonniert oder ist im Netzwerk beliebt.' };
            case 'system_generated': return { text: 'Aus dem Netz', icon: <LanguageIcon fontSize="inherit" color="disabled" />, tooltip: 'Dieser Inhalt wurde systemseitig als relevant eingestuft.' };
            default: return { text: null, icon: null, tooltip: null };
        }
    };

    return (
        <WidgetPaper 
            title={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', width: '100%' }}>
                    <Typography variant="h6">{title}</Typography>
                    <Badge badgeContent={counts.new} color="primary"><Chip label="Neu" size="small" variant="outlined" /></Badge>
                    <Badge badgeContent={counts.unread} color="secondary"><Chip label="Ungelesen" size="small" variant="outlined" /></Badge>
                    <Box sx={{ flexGrow: 1 }} />
                    <AnimatedSearchBar onSearch={setSearchTerm} />
                    {user?.regions && user.regions.length > 0 && (
                        <TextField
                            select value={selectedRegion?.id || ''}
                            onChange={(e) => {
                                const region = user?.regions?.find(r => r.id === e.target.value);
                                setSelectedRegion(region || null);
                            }}
                            size="small" variant="outlined" sx={{ minWidth: 60, '& .MuiSelect-select': { paddingRight: '24px' } }}
                            SelectProps={{
                                renderValue: (value) => {
                                    const region = user?.regions?.find(r => r.id === value);
                                    if (!region) return null;
                                    return <Tooltip title={region.name}><img src={`https://flagcdn.com/w20/${region.code.toLowerCase()}.png`} width="20" alt={region.name} /></Tooltip>;
                                }
                            }}
                        >
                            {user?.regions?.map((region) => <MenuItem key={region.id} value={region.id}><Tooltip title={region.name} placement="right"><img src={`https://flagcdn.com/w20/${region.code.toLowerCase()}.png`} width="20" alt={region.name} style={{ border: '1px solid #eee' }} /></Tooltip></MenuItem>)}
                        </TextField>
                    )}
                </Box>
            }
            widgetId={widgetId || ''} onDelete={onDelete} isRemovable={isRemovable} loading={isLoading} error={error}
        >
            <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <Box sx={{ flexGrow: 1, overflowY: 'auto', maxHeight: 280 }}>
                    {items.length > 0 ? (
                        <List dense>
                            {items.map((item, index) => {
                                const originProps = getOriginProps(item.origin);
                                return (
                                    <React.Fragment key={item.id}>
                                        <ListItem button onClick={() => handleOpenArticle(item)} onMouseDown={(e) => e.stopPropagation()}>
                                            <ListItemIcon sx={{minWidth: 36, opacity: item.is_read ? 0.4 : 1}}>{icon}</ListItemIcon>
                                            <ListItemText 
                                                primary={<Typography variant="body2" sx={{ fontWeight: item.is_read ? 'normal' : 'bold' }}>{item.title}</Typography>}
                                                secondary={originProps.text && <Tooltip title={originProps.tooltip || ''}><Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', fontSize: '0.75rem', color: 'text.secondary' }}>{originProps.icon}<span style={{ marginLeft: '4px' }}>{originProps.text}</span></Box></Tooltip>}
                                            />
                                        </ListItem>
                                        {index < items.length - 1 && <Divider component="li" />}
                                    </React.Fragment>
                                );
                            })}
                        </List>
                    ) : ( <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: 'center' }}>Keine Artikel für Ihre Auswahl gefunden.</Typography> )}
                </Box>
                {totalPages > 1 && <Box sx={{ display: 'flex', justifyContent: 'center', pt: 1 }}><Pagination count={totalPages} page={page} onChange={(e, value) => setPage(value)} size="small" /></Box>}
                <Divider sx={{ my: 1 }} />
                <Accordion disableGutters elevation={0} sx={{ p: 0, '&.Mui-expanded': { margin: 0 }, '&:before': { display: 'none' } }}>
                    <AccordionSummary expandIcon={<ExpandMoreIcon />} onMouseDown={(e) => e.stopPropagation()} sx={{ p: 0, minHeight: '36px', '& .MuiAccordionSummary-content': { margin: '8px 0' } }}><Typography variant="body2">Persönliches Thema abonnieren</Typography></AccordionSummary>
                    <AccordionDetails sx={{ p: 1, pt: 0 }}>
                        <Grid container spacing={2}>
                            {relevantRules.length > 1 && <Grid item xs={12}><TextField select fullWidth label="Analyse-Typ für Ihr Abo" value={selectedRuleId} onChange={(e) => setSelectedRuleId(e.target.value)} size="small"><MenuItem value=""><em>Bitte Analyse wählen</em></MenuItem>{relevantRules.map(rule => (<MenuItem key={rule.id} value={rule.id}>{rule.name}</MenuItem>))}</TextField></Grid>}
                            <Grid item xs={12}><Autocomplete multiple freeSolo options={[]} value={keywords} onChange={handleKeywordsChange} renderTags={(val, props) => val.map((opt, i) => <Chip label={opt} {...props({ index: i })} />)} renderInput={(params) => <TextField {...params} label={`Meine Hot Topics (Keywords) in ${selectedRegion?.name || ''}`} size="small" />}/></Grid>
                        </Grid>
                        <Button variant="contained" size="small" sx={{ mt: 2 }} startIcon={isSubmitting ? <CircularProgress size={20} color="inherit" /> : <SendIcon />} onClick={handleSubmitSubscription} onMouseDown={(e) => e.stopPropagation()} disabled={isSubmitting || !selectedRuleId || !selectedRegion || keywords.length === 0}>Thema abonnieren</Button>
                        {submitSuccess && <Alert severity="success" sx={{ mt: 1, p: '0 16px' }}>{submitSuccess}</Alert>}
                        {submitError && <Alert severity="error" sx={{ mt: 1, p: '0 16px' }}>{submitError}</Alert>}
                    </AccordionDetails>
                </Accordion>
            </Box>
            <Dialog open={!!selectedArticle} onClose={handleCloseDialog} fullWidth maxWidth="md">
                <DialogTitle sx={{ m: 0, p: 2 }}><Box display="flex" justifyContent="space-between" alignItems="center"><Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>{selectedArticle?.title}</Typography><IconButton aria-label="close" onClick={handleCloseDialog} sx={{ ml: 2 }}><CloseIcon /></IconButton></Box></DialogTitle>
                <DialogContent dividers><ArticleBodyRenderer summary={selectedArticle?.summary} /></DialogContent>
                <DialogActions sx={{ p: '16px 24px', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Button onClick={handleGenerateEmail} startIcon={<EmailIcon />} disabled={emailState.loading}>E-Mail-Entwurf{emailState.loading && <CircularProgress size={20} sx={{ ml: 1 }} />}</Button>
                    {selectedArticle && <VoteComponent item={selectedArticle} onVote={(vote) => handleVote(selectedArticle.id, vote)} />}
                </DialogActions>
            </Dialog>
            <Dialog open={emailState.open} onClose={handleCloseEmailDialog} fullWidth maxWidth="md">
                <DialogTitle>E-Mail-Entwurf</DialogTitle>
                <DialogContent>
                    {emailState.loading && <Box sx={{ display: 'flex', justifyContent: 'center', my: 5 }}><CircularProgress /></Box>}
                    {emailState.error && <Alert severity="error">{emailState.error}</Alert>}
                    {!emailState.loading && !emailState.error && (
                        <Stack spacing={2} sx={{ mt: 1 }}>
                            <TextField label="Betreff" fullWidth value={emailState.subject} onChange={(e) => setEmailState(s => ({ ...s, subject: e.target.value }))} InputProps={{ endAdornment: (<Tooltip title="Betreff kopieren"><IconButton onClick={() => handleCopyToClipboard(emailState.subject)}><ContentCopyIcon /></IconButton></Tooltip>)}}/>
                            <TextField label="E-Mail-Text" fullWidth multiline rows={10} value={emailState.body} onChange={(e) => setEmailState(s => ({ ...s, body: e.target.value }))}/>
                            <Button onClick={() => handleCopyToClipboard(emailState.body)} startIcon={<ContentCopyIcon />}>E-Mail-Text kopieren</Button>
                        </Stack>
                    )}
                </DialogContent>
                <DialogActions><Button onClick={handleCloseEmailDialog}>Schließen</Button></DialogActions>
            </Dialog>
        </WidgetPaper>
    );
};

export default GenericAIWidget;
