import React, { useState, useEffect, useMemo } from 'react';
import { Box, Typography, Button, Stack, Skeleton, Fade, useTheme } from '@mui/material';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import apiClient from '../../apiClient';
import WidgetPaper from './WidgetPaper'; 
import { BaseWidgetProps } from '../../types/dashboard.types';
import { useTranslation } from 'react-i18next'; // ✅ NEU: Import

interface SentimentWidgetProps extends Partial<BaseWidgetProps> {
    widgetId: string;
    icon?: React.ReactNode;
    title?: string;
    widgetTypeKey?: string;
    isPublic?: boolean;
}

// --- SVG Helper Funktionen ---
const polarToCartesian = (centerX: number, centerY: number, radius: number, angleInDegrees: number) => {
    const angleInRadians = (angleInDegrees - 180) * Math.PI / 180.0;
    return {
        x: centerX + (radius * Math.cos(angleInRadians)),
        y: centerY + (radius * Math.sin(angleInRadians))
    };
};

const describeArc = (x: number, y: number, innerRadius: number, outerRadius: number, startAngle: number, endAngle: number) => {
    const start = polarToCartesian(x, y, outerRadius, endAngle);
    const end = polarToCartesian(x, y, outerRadius, startAngle);
    const start2 = polarToCartesian(x, y, innerRadius, endAngle);
    const end2 = polarToCartesian(x, y, innerRadius, startAngle);

    const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";

    return [
        "M", start.x, start.y,
        "A", outerRadius, outerRadius, 0, largeArcFlag, 0, end.x, end.y,
        "L", end2.x, end2.y,
        "A", innerRadius, innerRadius, 0, largeArcFlag, 1, start2.x, start2.y,
        "Z"
    ].join(" ");
};

const SentimentWidget: React.FC<SentimentWidgetProps> = ({ widgetId, onDelete, isRemovable, title, widgetTypeKey, icon, isPublic = false }) => {
    const { t } = useTranslation(); // ✅ NEU: Hook nutzen
    const theme = useTheme();
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<any>(null);
    const [animating, setAnimating] = useState(false);

    const fetchData = async () => {
        if (isPublic) {
            setData({
                active: true,
                questionId: 'ghost',
                questionText: null, // Nutzen Fallback aus Translation
                stats: { bullishPercent: 65, total: 1250 },
                userVote: null,
                hasVoted: false
            });
            setLoading(false);
            return;
        }

        try {
            const res = await apiClient.get('/api/data/sentiment');
            setData(res.data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, [isPublic]);

    const handleVote = async (vote: 'bullish' | 'bearish') => {
        if (isPublic) return;
        setAnimating(true);
        try {
            await apiClient.post('/api/data/sentiment/vote', { questionId: data.questionId, vote });
            await fetchData(); 
        } catch (e) {
            console.error(e);
        } finally {
            setAnimating(false);
        }
    };

    // ✅ Übersetzung für Titel nutzen
    const displayTitle = typeof title === 'string' ? title : t('widgets.sentiment.title');

    const titleHeader = (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {icon}
            <Typography variant="h6">{displayTitle}</Typography>
        </Box>
    );

    const score = data?.stats?.bullishPercent ?? 50; 
    
    // ✅ Labels jetzt dynamisch via t()
    const gaugeConfig = useMemo(() => {
        const cx = 200;
        const cy = 200;
        const iR = 100; 
        const oR = 180; 
        const gap = 2;

        const segments = [
            { label: t('widgets.sentiment.segments.extBearish'), color: "#cfd8dc", activeColor: "#d32f2f", min: 0, max: 20 },
            { label: t('widgets.sentiment.segments.bearish'),    color: "#eceff1", activeColor: "#ef9a9a", min: 20, max: 40 },
            { label: t('widgets.sentiment.segments.neutral'),    color: "#f5f5f5", activeColor: "#bdbdbd", min: 40, max: 60 },
            { label: t('widgets.sentiment.segments.bullish'),    color: "#e8f5e9", activeColor: "#a5d6a7", min: 60, max: 80 },
            { label: t('widgets.sentiment.segments.extBullish'), color: "#c8e6c9", activeColor: "#2e7d32", min: 80, max: 100 }
        ];

        const totalAngle = 180;
        const segmentAngle = (totalAngle - (gap * (segments.length - 1))) / segments.length;

        const activeSegmentIndex = segments.findIndex(s => score >= s.min && score <= s.max);
        const safeActiveIndex = activeSegmentIndex === -1 ? (score === 0 ? 0 : 4) : activeSegmentIndex;

        return { cx, cy, iR, oR, segments, segmentAngle, gap, activeIndex: safeActiveIndex };
    }, [score, t]); // ✅ 't' als Dependency, damit Sprache live wechselt

    const bullishColor = '#00c805'; 
    const bearishColor = '#ff3b30';
    const currentActiveColor = gaugeConfig.segments[gaugeConfig.activeIndex].activeColor;

    if (loading) {
        return (
            <WidgetPaper 
                widgetId={widgetId} widgetTitle={displayTitle} widgetTypeKey={widgetTypeKey || 'sentiment_widget'}
                title={titleHeader} onDelete={onDelete} isRemovable={isRemovable} loading={true} error={null} isPublic={isPublic}
            >
                <Skeleton height={200} />
            </WidgetPaper>
        );
    }

    if (!data?.active) return null; 

    return (
        <WidgetPaper 
            widgetId={widgetId} 
            widgetTitle={displayTitle} 
            widgetTypeKey={widgetTypeKey || 'sentiment_widget'}
            title={titleHeader} 
            onDelete={onDelete} 
            isRemovable={isRemovable} 
            noPadding
            loading={false}
            error={null}
            isPublic={isPublic} 
        >
            <Box sx={{ p: 2, textAlign: 'center', display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'center' }}>
                
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                    {data.questionText || t('widgets.sentiment.question')}
                </Typography>

                {!data.hasVoted && !isPublic ? (
                    <Fade in={!data.hasVoted}>
                        <Stack spacing={2} sx={{ mt: 2 }}>
                            <Button variant="outlined" size="large" startIcon={<TrendingUpIcon />} onClick={() => handleVote('bullish')} disabled={animating}
                                sx={{ py: 1.5, fontSize: '1.1rem', color: bullishColor, borderColor: bullishColor, '&:hover': { bgcolor: 'rgba(0, 200, 5, 0.08)', borderColor: bullishColor } }}>
                                {t('widgets.sentiment.btnBullish')}
                            </Button>
                            <Button variant="outlined" size="large" startIcon={<TrendingDownIcon />} onClick={() => handleVote('bearish')} disabled={animating}
                                sx={{ py: 1.5, fontSize: '1.1rem', color: bearishColor, borderColor: bearishColor, '&:hover': { bgcolor: 'rgba(255, 59, 48, 0.08)', borderColor: bearishColor } }}>
                                {t('widgets.sentiment.btnBearish')}
                            </Button>
                        </Stack>
                    </Fade>
                ) : (
                    <Fade in={true}>
                        <Box sx={{ position: 'relative', width: '100%', maxWidth: 350, margin: '0 auto' }}>
                            <svg viewBox="0 0 400 220" style={{ width: '100%', height: 'auto' }}>
                                {/* Segmente zeichnen */}
                                {gaugeConfig.segments.map((seg, i) => {
                                    const startAngle = i * (gaugeConfig.segmentAngle + gaugeConfig.gap);
                                    const endAngle = startAngle + gaugeConfig.segmentAngle;
                                    const fillColor = i === gaugeConfig.activeIndex ? seg.activeColor : seg.color;
                                    const pathD = describeArc(gaugeConfig.cx, gaugeConfig.cy, gaugeConfig.iR, gaugeConfig.oR, startAngle, endAngle);
                                    
                                    const midAngle = startAngle + (gaugeConfig.segmentAngle / 2);
                                    const textRadius = gaugeConfig.iR + (gaugeConfig.oR - gaugeConfig.iR) / 2;
                                    const labelPos = polarToCartesian(gaugeConfig.cx, gaugeConfig.cy, textRadius, midAngle);
                                    const rotation = midAngle - 90;
                                    const lines = seg.label.split(' ');

                                    return (
                                        <g key={i}>
                                            <path d={pathD} fill={fillColor} />
                                            <text
                                                x={labelPos.x}
                                                y={labelPos.y}
                                                fill={i === gaugeConfig.activeIndex ? '#fff' : '#9e9e9e'}
                                                fontSize="13"
                                                fontWeight="bold"
                                                textAnchor="middle"
                                                alignmentBaseline="middle"
                                                transform={`rotate(${rotation}, ${labelPos.x}, ${labelPos.y})`}
                                                style={{ pointerEvents: 'none' }}
                                            >
                                                {lines.length > 1 ? (
                                                    <>
                                                        <tspan x={labelPos.x} dy="-0.4em">{lines[0]}</tspan>
                                                        <tspan x={labelPos.x} dy="1.2em">{lines[1]}</tspan>
                                                    </>
                                                ) : lines[0]}
                                            </text>
                                        </g>
                                    );
                                })}

                                {/* Nadel / Indikator */}
                                <g transform={`rotate(${(score * 1.8) - 90}, 200, 200)`}>
                                    <polygon points="190,200 210,200 200,185" fill="#000" />
                                </g>

                                {/* Score Halbkreis unten Mitte */}
                                <path d={describeArc(200, 200, 0, 75, 0, 180)} fill={currentActiveColor} />
                                
                                <text x="200" y="150" textAnchor="middle" fill="rgba(255,255,255,0.9)" fontSize="11" fontWeight="bold" letterSpacing="1px">
                                    {t('widgets.sentiment.scoreLabel')}
                                </text>
                                <text x="200" y="190" textAnchor="middle" fill="#fff" fontSize="40" fontWeight="bold">
                                    {score}
                                </text>
                            </svg>
                            
                            {/* Legend / Vote Info */}
                            <Box sx={{ mt: -2 }}>
                                <Typography variant="caption" color="text.secondary">
                                    {isPublic 
                                        ? t('widgets.sentiment.trendPublic') 
                                        : `${t('widgets.sentiment.voteLabel')}: ${data.userVote === 'bullish' ? t('widgets.sentiment.votePos') : t('widgets.sentiment.voteNeg')}`
                                    } 
                                    {' '}| Total: {data.stats.total}
                                </Typography>
                            </Box>
                        </Box>
                    </Fade>
                )}
            </Box>
        </WidgetPaper>
    );
};

export default SentimentWidget;