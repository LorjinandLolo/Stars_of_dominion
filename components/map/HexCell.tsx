"use client";

import React, { memo } from 'react';
import { getSectorType } from '@/lib/game-rules';

interface HexCellProps {
    c: number;
    r: number;
    size: number;
    center: { x: number, y: number };
    corners: { x: number, y: number }[];
    planet: any;
    army: any;
    isSelected: boolean;
    isDragging: boolean;
    playerFactionId: string | null;
    factions: any[];
    diplomacyState: any;
    onHexClick?: (x: number, y: number) => void;
}

const HexCell = memo(({
    c, r, size, center, corners, planet, army, isSelected, isDragging,
    playerFactionId, factions, diplomacyState, onHexClick
}: HexCellProps) => {
    
    // ─── STYLES & TERRAIN ───────────────────────────────────────────────────
    const terrain = getSectorType(c, r);
    let fill = '#0a0a0a';
    let stroke = '#262626';

    const asteroids = [];
    if (terrain === 'asteroid_field') {
        fill = '#18181b';
        stroke = '#27272a';
        const seed = (c * 31 + r * 17);
        const count = (seed % 4) + 3;
        for (let i = 0; i < count; i++) {
            const ax = ((seed * (i + 1) * 7) % (size * 1.2)) - size * 0.6;
            const ay = ((seed * (i + 2) * 11) % (size * 1.2)) - size * 0.6;
            const ar = ((seed * (i + 3)) % 3) + 1.5;
            asteroids.push(<circle key={`ast-${i}`} cx={ax} cy={ay} r={ar} fill="#3f3f46" opacity="0.8" />);
        }
    } else if (terrain === 'nebula') {
        fill = '#172554';
    } else if (terrain === 'ion_storm') {
        fill = '#082f49';
        stroke = '#0284c7';
    }

    if (planet && planet._parsedAttrs) {
        const attrs = planet._parsedAttrs;
        if (attrs.archetype_tag) {
            switch (attrs.archetype_tag) {
                case 'throat': fill = '#7f1d1d'; stroke = '#ef4444'; break;
                case 'canal': fill = '#0891b2'; stroke = '#22d3ee'; break;
                case 'spine': fill = '#CA8A04'; stroke = '#EAB308'; break;
                case 'fortress': fill = '#3f6212'; stroke = '#84cc16'; break;
                case 'void': fill = '#450a0a'; stroke = '#000000'; break;
                case 'basin': fill = '#1e1b4b'; stroke = '#6366f1'; break;
            }
        }
    }

    if (isSelected) {
        stroke = '#22c55e';
    }

    // ─── HELPERS ────────────────────────────────────────────────────────────
    const getOwnershipColor = (ownerId: string | null) => {
        if (!ownerId) return 'var(--color-owner-neutral)';
        if (ownerId === playerFactionId) return 'var(--color-owner-player)';
        
        const isAlly = diplomacyState?.treaties?.some((t: any) => 
            t.status === 'active' && 
            t.signatories.includes(ownerId) && 
            t.signatories.includes(playerFactionId!) &&
            (t.type === 'mutual_defense' || t.type === 'non_aggression' || t.type === 'research_share' || t.type === 'intelligence_pact')
        );
        if (isAlly) return 'var(--color-owner-ally)';

        const isEnemy = diplomacyState?.rivalries?.some((r: any) => 
            (r.empireAId === ownerId && r.empireBId === playerFactionId) ||
            (r.empireBId === ownerId && r.empireAId === playerFactionId)
        );
        if (isEnemy) return 'var(--color-owner-enemy)';

        return 'var(--color-owner-neutral)';
    };

    const getFactionColor = (factionId: string) => {
        return getOwnershipColor(factionId);
    };

    // Moon logic
    const hasMoon = (c * 13 + r * 7) % 10 > 6;
    const moon = (planet && hasMoon) ? (
        <circle cx={size * 0.55} cy={-size * 0.55} r={size * 0.15} fill="#a1a1aa" opacity="0.9" />
    ) : null;

    return (
        <g transform={`translate(${center.x}, ${center.y})`}
            onClick={(e) => {
                e.stopPropagation();
                if (!isDragging) onHexClick?.(c, r);
            }}
            style={{ cursor: 'pointer' }}
        >
            <polygon
                points={corners.map(p => `${p.x},${p.y}`).join(' ')}
                fill={fill}
                stroke={stroke}
                strokeWidth="1"
                className="transition-colors duration-200 hover:fill-zinc-800"
            />

            {terrain === 'nebula' && (
                <circle cx={0} cy={0} r={size * 0.8} fill="#3b82f6" opacity="0.15" filter="url(#glow)" />
            )}
            {terrain === 'ion_storm' && (
                <>
                    <path d={`M -5,-10 L 5,0 L -2,3 L 8,12`} stroke="#38bdf8" strokeWidth="1.5" fill="none" opacity="0.6" filter="url(#glow)" />
                    <circle cx={0} cy={0} r={size * 0.6} fill="#0ea5e9" opacity="0.1" filter="url(#glow)" />
                </>
            )}
            {asteroids}

            {moon}

            {planet && (
                <circle r={size * 0.4} fill={planet.ownerId ? getFactionColor(planet.ownerId) : '#52525b'} />
            )}

            {planet?.siege && (
                <text x={0} y={4} textAnchor="middle" fill="#ef4444" fontSize="14" fontWeight="bold" fontFamily="monospace">
                    ⚔
                </text>
            )}

            {planet?.unrest > 80 && !planet?.siege && (
                <text x={0} y={4} textAnchor="middle" fill="#f59e0b" fontSize="16" fontWeight="bold" fontFamily="monospace">
                    !
                </text>
            )}

            {army && (
                <rect x={-5} y={-5} width={10} height={10} fill="#ef4444" transform="rotate(45)" />
            )}
        </g>
    );
});

HexCell.displayName = 'HexCell';

export default HexCell;
