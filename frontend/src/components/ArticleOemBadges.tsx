import React, { useEffect, useState } from 'react';
import { Avatar, Box, Tooltip, Typography } from '@mui/material';
import { ArticleTag, getArticleOemTags, getArticleOemLogoUrl } from '../utils/articlePresentation';
import { resolveAssetUrl } from '../utils/assetUrl';

const OemBadge: React.FC<{ tag: ArticleTag }> = ({ tag }) => {
    const [failed, setFailed] = useState(false);
    useEffect(() => setFailed(false), [tag.logo_url]);
    if (failed) return null;
    // Uploaded tag logos live in the backend volume, not Plesk's frontend root.
    const url = getArticleOemLogoUrl(tag.logo_url!, resolveAssetUrl);
    return (
        <Tooltip title={`Hersteller: ${tag.name}`}>
            <Avatar src={url} alt={tag.name} imgProps={{ onError: () => setFailed(true), loading: 'lazy' }}
                sx={{ width: 32, height: 32, p: '4px', bgcolor: '#fff', border: '1px solid', borderColor: 'divider',
                    boxShadow: '0 1px 5px rgba(0,0,0,0.12)', '& img': { objectFit: 'contain' } }} />
        </Tooltip>
    );
};

const ArticleOemBadges: React.FC<{ tags?: ArticleTag[] | null }> = ({ tags }) => {
    const oems = getArticleOemTags(tags);
    if (!oems.length) return null;
    return (
        <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
            {oems.slice(0, 3).map((tag) => <OemBadge key={tag.name} tag={tag} />)}
            {oems.length > 3 && <Tooltip title={oems.slice(3).map((tag) => tag.name).join(', ')}>
                <Typography variant="caption" sx={{ bgcolor: 'background.paper', borderRadius: 3, px: 0.75 }}>+{oems.length - 3}</Typography>
            </Tooltip>}
        </Box>
    );
};

export default ArticleOemBadges;
