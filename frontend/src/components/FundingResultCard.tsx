import React from 'react';
import {
    Card, CardContent, CardActions, Typography, Box, Chip, Link as MuiLink,
    Button, Grid, Tooltip, LinearProgress, IconButton
} from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import FindReplaceIcon from '@mui/icons-material/FindReplace';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';


interface FundingResult {
    id: string;
    title: string;
    summary_ai: string;
    deadline_end: string | null;
    region: string;
    funding_amount_max?: number;
    original_url: string;
    categories?: string[];
    match_score: number;
    user_status: 'favorited' | 'hidden' | 'applied' | null;
}

interface FundingCategory {
    id: number;
    name: string;
}

interface Props {
    item: FundingResult;
    allCategories: FundingCategory[];
    selectedCategoryIds: number[];
    onFindSimilar: (item: FundingResult) => void;
    onGenerateDraft: (item: FundingResult) => void;
    onSetStatus: (opportunityId: string, status: FundingResult['user_status'] | null) => void;
}

const FundingResultCard: React.FC<Props> = ({ item, allCategories, selectedCategoryIds, onFindSimilar, onGenerateDraft, onSetStatus }) => {
    
    const getDomainFromUrl = (url: string): string => {
        try {
            return new URL(url).hostname.replace(/^www\./, '');
        } catch (e) {
            return "Ungültige URL";
        }
    };

    const selectedCategoryNames = allCategories
        .filter(c => selectedCategoryIds.includes(c.id))
        .map(c => c.name);

    const scoreColor = item.match_score > 70 ? 'success' : item.match_score > 40 ? 'warning' : 'primary';

    const handleStatusClick = (newStatus: FundingResult['user_status']) => {
        const statusToSend = item.user_status === newStatus ? null : newStatus;
        onSetStatus(item.id, statusToSend);
    };

    return (
        <Grid item xs={12} md={6} lg={4}>
            <Card sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <CardContent sx={{ flexGrow: 1 }}>
                    <Tooltip title={`Relevanz für Ihr Profil: ${Math.round(item.match_score)}%`}>
                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1.5, gap: 1.5 }}>
                            <Typography variant="body2" sx={{ fontWeight: 'bold', color: `${scoreColor}.main`, width: '45px' }}>
                                {Math.round(item.match_score)}%
                            </Typography>
                            <LinearProgress
                                variant="determinate"
                                value={item.match_score}
                                color={scoreColor}
                                sx={{ width: '100%' }}
                            />
                        </Box>
                    </Tooltip>

                    <Typography variant="h6" component="h3" gutterBottom>
                        <MuiLink component={RouterLink} to={`/funding-detail/${item.id}`} underline="hover" color="inherit">
                            {item.title}
                        </MuiLink>
                    </Typography>
                    
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        {item.summary_ai}
                    </Typography>

                    {item.categories && item.categories.length > 0 && (
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                            {item.categories.map((category) => {
                                const isSelected = selectedCategoryNames.includes(category);
                                return (
                                    <Chip 
                                        key={category} 
                                        label={category} 
                                        size="small" 
                                        variant={isSelected ? "filled" : "outlined"}
                                        color={isSelected ? "primary" : "default"}
                                    />
                                );
                            })}
                        </Box>
                    )}
                </CardContent>

        <CardActions sx={{ px: 2, pb: 2, justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
            <Button size="small" href={item.original_url} target="_blank" startIcon={<OpenInNewIcon />}>
                {getDomainFromUrl(item.original_url)}
            </Button>
            <Box>
                {/* KORREKTUR: Einheitliche Icon-Darstellung */}
                <Tooltip title="Als Favorit merken">
                    <IconButton size="small" onClick={() => handleStatusClick('favorited')}>
                        <StarIcon color={item.user_status === 'favorited' ? 'warning' : 'action'} />
                    </IconButton>
                </Tooltip>
                <Tooltip title="Als 'Beworben' markieren">
                    <IconButton size="small" onClick={() => handleStatusClick('applied')}>
                        <CheckCircleIcon color={item.user_status === 'applied' ? 'success' : 'action'} />
                    </IconButton>
                </Tooltip>
                <Tooltip title="Ausblenden">
                    <IconButton size="small" onClick={() => onSetStatus(item.id, 'hidden')}><VisibilityOffIcon color="action"/></IconButton>
                </Tooltip>
                <Tooltip title="Ähnliche Förderungen finden">
                    <IconButton size="small" onClick={() => onFindSimilar(item)}><FindReplaceIcon color="action"/></IconButton>
                </Tooltip>
                <Tooltip title="KI-Anschreiben entwerfen">
                    <IconButton size="small" onClick={() => onGenerateDraft(item)}><AutoAwesomeIcon color="primary" /></IconButton>
                </Tooltip>
            </Box>
        </CardActions>
            </Card>
        </Grid>
    );
};

export default FundingResultCard;