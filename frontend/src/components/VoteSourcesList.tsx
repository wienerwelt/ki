import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Alert,
    Avatar,
    Box,
    Chip,
    CircularProgress,
    Link as MuiLink,
    List,
    Paper,
    Rating,
    Snackbar,
    Typography
} from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import VerifiedIcon from '@mui/icons-material/Verified';
import HourglassTopIcon from '@mui/icons-material/HourglassTop';
import apiClient from '../apiClient';
import { resolveAssetUrl } from '../utils/assetUrl';

interface TrustSource {
    id: string;
    url: string;
    description: string | null;
    status: 'pending_review' | 'approved';
    category_name: string | null;
    category_name_lang: string | null;
    logo_url: string | null;
    average_rating: number | string | null;
    vote_count: number | string | null;
    user_rating: number | string | null;
    user_vote_updated_at: string | null;
}

const getDomainInitial = (url: string) => {
    try {
        return new URL(url).hostname.replace(/^www\./, '').charAt(0).toUpperCase();
    } catch {
        return url.charAt(0).toUpperCase();
    }
};

interface VoteSourcesListProps {
    onScoreChange?: () => void;
    onOpenCountChange?: (count: number) => void;
}

export const VoteSourcesList: React.FC<VoteSourcesListProps> = ({ onScoreChange, onOpenCountChange }) => {
    const [sources, setSources] = useState<TrustSource[]>([]);
    const [loading, setLoading] = useState(true);
    const [savingId, setSavingId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    const fetchSources = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const { res, data } = await apiClient.get<TrustSource[]>('/api/sources/community-trust');
            if (!res.ok) throw new Error((data as any)?.message || 'Community-Trust konnte nicht geladen werden.');
            setSources(Array.isArray(data) ? data : []);
        } catch (err: any) {
            setError(err?.message || 'Community-Trust konnte nicht geladen werden.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchSources();
    }, [fetchSources]);

    const openCount = useMemo(
        () => sources.filter((source) => !source.user_rating).length,
        [sources]
    );

    useEffect(() => {
        onOpenCountChange?.(openCount);
    }, [onOpenCountChange, openCount]);

    const handleVote = async (sourceId: string, rating: number | null) => {
        if (!rating || savingId) return;
        setSavingId(sourceId);
        try {
            const { res, data } = await apiClient.post<any>(`/api/sources/${sourceId}/vote`, { rating });
            if (!res.ok) throw new Error(data?.message || 'Community-Trust konnte nicht gespeichert werden.');
            setSources((previous) => previous.map((source) => (
                source.id === sourceId
                    ? {
                        ...source,
                        user_rating: data?.userRating,
                        vote_count: data?.voteCount,
                        average_rating: data?.averageRating,
                        user_vote_updated_at: new Date().toISOString()
                    }
                    : source
            )));
            setNotice(data?.message || 'Community-Trust gespeichert.');
            window.dispatchEvent(new Event('menu-badges-refresh'));
            if (data?.isFirstVote) onScoreChange?.();
        } catch (err: any) {
            setNotice(err?.message || 'Community-Trust konnte nicht gespeichert werden.');
        } finally {
            setSavingId(null);
        }
    };

    if (loading) {
        return <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}><CircularProgress /></Box>;
    }

    if (error) {
        return <Alert severity="error" sx={{ borderRadius: 2 }}>{error}</Alert>;
    }

    return (
        <Box maxWidth="md" mx="auto">
            <Box sx={{ mb: 4, textAlign: 'center' }}>
                <Typography variant="h5" gutterBottom fontWeight={800} color="primary.main">
                    Community-Trust bewerten
                </Typography>
                <Typography variant="body1" color="text.secondary">
                    Die redaktionelle Freigabe entscheidet über die Veröffentlichung. Deine Vertrauensbewertung
                    bleibt auch danach sichtbar und kann jederzeit angepasst werden.
                </Typography>
                <Box sx={{ mt: 2, display: 'flex', gap: 1, justifyContent: 'center', flexWrap: 'wrap' }}>
                    <Chip label={`${openCount} noch nicht bewertet`} color={openCount ? 'primary' : 'default'} />
                    <Chip label="+1 Punkt bei der ersten Bewertung" variant="outlined" />
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                    „Noch nicht bewertet“ entspricht der roten Badge-Zahl bei „Vertrauensw. Quellen“ in der Navigation.
                </Typography>
            </Box>

            {sources.length > 0 ? (
                <List sx={{ p: 0 }}>
                    {sources.map((source) => {
                        const ownRating = source.user_rating ? Number(source.user_rating) : 0;
                        const averageRating = Number(source.average_rating || 0);
                        const voteCount = Number(source.vote_count || 0);
                        const isSaving = savingId === source.id;

                        return (
                            <Paper
                                key={source.id}
                                elevation={1}
                                sx={{ p: { xs: 2, sm: 3 }, mb: 3, borderRadius: 3, border: '1px solid', borderColor: 'divider' }}
                            >
                                <Box sx={{ display: 'flex', gap: 3, alignItems: 'flex-start', flexDirection: { xs: 'column', sm: 'row' } }}>
                                    <Box sx={{ flexGrow: 1, display: 'flex', gap: 2, alignItems: 'flex-start', width: '100%', minWidth: 0 }}>
                                        {source.logo_url ? (
                                            <Box
                                                component="img"
                                                src={resolveAssetUrl(source.logo_url)}
                                                alt="Logo"
                                                onError={(event: React.SyntheticEvent<HTMLImageElement>) => {
                                                    event.currentTarget.onerror = null;
                                                    event.currentTarget.src = '/logos/default-company.svg';
                                                }}
                                                sx={{ width: 64, height: 64, objectFit: 'contain', bgcolor: 'grey.50', p: 1, borderRadius: 2, border: '1px solid', borderColor: 'divider', flexShrink: 0 }}
                                            />
                                        ) : (
                                            <Avatar variant="rounded" sx={{ width: 64, height: 64, bgcolor: 'secondary.main', fontSize: '1.5rem', fontWeight: 800, flexShrink: 0 }}>
                                                {getDomainInitial(source.url)}
                                            </Avatar>
                                        )}

                                        <Box sx={{ minWidth: 0 }}>
                                            <MuiLink href={source.url} target="_blank" rel="noopener noreferrer" underline="hover" sx={{ display: 'inline-flex', alignItems: 'center', color: 'text.primary', maxWidth: '100%' }}>
                                                <Typography variant="h6" component="span" sx={{ fontWeight: 800, wordBreak: 'break-word' }}>
                                                    {source.url.replace(/^https?:\/\//, '')}
                                                </Typography>
                                                <OpenInNewIcon sx={{ ml: 1, fontSize: '1.1rem', color: 'primary.main', flexShrink: 0 }} />
                                            </MuiLink>

                                            <Box sx={{ mt: 0.75, mb: 1.25, display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                                                {!ownRating && (
                                                    <Chip label="Offen · zählt zum Navigations-Badge" size="small" color="error" />
                                                )}
                                                <Chip
                                                    icon={source.status === 'approved' ? <VerifiedIcon /> : <HourglassTopIcon />}
                                                    label={source.status === 'approved' ? 'Redaktionell freigegeben' : 'Freigabe wird geprüft'}
                                                    size="small"
                                                    color={source.status === 'approved' ? 'success' : 'warning'}
                                                    variant="outlined"
                                                />
                                                {(source.category_name_lang || source.category_name) && (
                                                    <Chip label={source.category_name_lang || source.category_name} size="small" />
                                                )}
                                            </Box>

                                            <Typography variant="body2" color="text.secondary">
                                                {source.description || 'Keine Beschreibung vorhanden.'}
                                            </Typography>
                                            <Box sx={{ mt: 1.5, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                                                <Rating value={averageRating} precision={0.1} size="small" readOnly />
                                                <Typography variant="caption" color="text.secondary">
                                                    Community {averageRating.toFixed(1)} · {voteCount} {voteCount === 1 ? 'Bewertung' : 'Bewertungen'}
                                                </Typography>
                                            </Box>
                                        </Box>
                                    </Box>

                                    <Box sx={{ minWidth: { sm: 220 }, width: { xs: '100%', sm: 'auto' }, bgcolor: 'background.default', p: 2, borderRadius: 2, textAlign: 'center', border: '1px dashed', borderColor: ownRating ? 'success.main' : 'primary.light' }}>
                                        <Typography variant="subtitle2" color={ownRating ? 'success.main' : 'primary.main'} sx={{ mb: 1, fontWeight: 800 }}>
                                            {ownRating ? 'Deine Bewertung' : 'Wie vertrauenswürdig?'}
                                        </Typography>
                                        <Rating
                                            name={`rating-${source.id}`}
                                            value={ownRating}
                                            size="large"
                                            disabled={isSaving}
                                            onChange={(_event, newValue) => handleVote(source.id, newValue)}
                                        />
                                        <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 1 }}>
                                            {isSaving
                                                ? 'Wird gespeichert …'
                                                : ownRating
                                                    ? 'Antippen, um die Bewertung zu ändern.'
                                                    : '1 = nicht vertrauenswürdig · 5 = sehr vertrauenswürdig'}
                                        </Typography>
                                    </Box>
                                </Box>
                            </Paper>
                        );
                    })}
                </List>
            ) : (
                <Alert severity="info" sx={{ borderRadius: 2 }}>Derzeit stehen keine Quellen für Community-Trust bereit.</Alert>
            )}

            <Snackbar
                open={Boolean(notice)}
                autoHideDuration={4500}
                onClose={() => setNotice(null)}
                message={notice}
            />
        </Box>
    );
};
