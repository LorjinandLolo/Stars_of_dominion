"use client";

import React, { memo } from 'react';

interface SystemNodeProps {
    sys: any;
    px: { x: number; y: number };
    isSelected: boolean;
    revealStage: string;
    styles: any;
    contested: boolean;
    isMobile: boolean;
    hexPoints: string;
    onSelect: (id: string) => void;
}

const SystemNode = memo(({
    sys, px, isSelected, revealStage, styles, contested, isMobile, hexPoints, onSelect
}: SystemNodeProps) => {
    return (
        <g
            transform={`translate(${px.x}, ${px.y})`}
            onClick={(e) => {
                e.stopPropagation();
                onSelect(sys.id);
            }}
            className="transition-all"
            style={{ cursor: 'pointer', opacity: styles.opacity }}
        >
            <polygon
                points={hexPoints}
                fill={styles.fill}
                stroke={isSelected ? 'var(--color-neon-blue)' : styles.stroke}
                strokeWidth={isSelected ? 2 : 1}
                filter={!isMobile && isSelected ? 'url(#hex-glow)' : undefined}
            />
            {styles.showDot && (
                <circle
                    r={sys.tags.includes('gate') || sys.tags.includes('fortress') ? 4 : 2.5}
                    fill={sys.ownerId ? (sys.ownerId === 'faction-aurelian' ? '#3b82f6' : sys.ownerId === 'faction-vektori' ? '#ef4444' : '#22c55e') : '#94a3b8'}
                    className="animate-breathe"
                />
            )}
            {contested && (
                <polygon
                    points={hexPoints}
                    fill="none"
                    stroke="#f97316"
                    strokeWidth={1.5}
                    strokeDasharray="3 2"
                    opacity={0.75}
                    style={{ animation: 'spin 8s linear infinite' }}
                    pointerEvents="none"
                />
            )}
        </g>
    );
});

SystemNode.displayName = 'SystemNode';

export default SystemNode;
