import React from 'react';
import { Box, Tooltip } from '@mui/material';

export type AiContentLabelKind = 'ai' | 'modified' | 'generated';

interface AiContentLabelProps {
    kind?: AiContentLabelKind;
    size?: number;
}

const LABELS: Record<AiContentLabelKind, {
    src: string;
    alt: string;
    crop: { x: number; y: number; width: number; height: number };
}> = {
    ai: {
        src: '/AI-label.png',
        alt: 'KI-unterstützt',
        crop: { x: 641, y: 224, width: 1219, height: 1219 },
    },
    modified: {
        src: '/AI_modified-label.png',
        alt: 'KI-generiert und bearbeitet',
        crop: { x: 259, y: 604, width: 1984, height: 432 },
    },
    generated: {
        src: '/AI_generated-label.png',
        alt: 'KI-generiert',
        crop: { x: 121, y: 604, width: 2259, height: 433 },
    },
};

const SOURCE_WIDTH = 2501;
const SOURCE_HEIGHT = 1668;

const AiContentLabel: React.FC<AiContentLabelProps> = ({ kind = 'generated', size = 18 }) => {
    const label = LABELS[kind];
    const scale = size / label.crop.height;
    const width = label.crop.width * scale;

    return (
        <Tooltip title={label.alt} arrow>
            <Box
                component="span"
                role="img"
                aria-label={label.alt}
                sx={{
                    position: 'relative',
                    display: 'inline-block',
                    width,
                    height: size,
                    flexShrink: 0,
                    overflow: 'hidden',
                    lineHeight: 0,
                    verticalAlign: 'middle',
                }}
            >
                <Box
                    component="img"
                    src={label.src}
                    alt=""
                    aria-hidden="true"
                    sx={{
                        position: 'absolute',
                        width: SOURCE_WIDTH * scale,
                        height: SOURCE_HEIGHT * scale,
                        maxWidth: 'none',
                        left: -label.crop.x * scale,
                        top: -label.crop.y * scale,
                        pointerEvents: 'none',
                        userSelect: 'none',
                    }}
                />
            </Box>
        </Tooltip>
    );
};

export default AiContentLabel;
