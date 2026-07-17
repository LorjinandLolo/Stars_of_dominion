"use client";

import React, { memo } from 'react';
import { classifyStar, systemSize, revealBrightness, dominantTagVisual, OBSERVABLE_TAGS, PHENOMENA_TAGS, RELATIONSHIP_COLORS } from './starVisuals';
import type { Relationship } from './starVisuals';

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
    isCapital: boolean;
    ownerColor: string;
    relationship: Relationship | null;
    activeOverlay: string | null;
    showLabel: boolean;
}

const SystemNode = memo(({
    sys, px, isSelected, revealStage, styles, contested, isMobile, hexPoints, onSelect,
    isCapital, ownerColor, relationship, activeOverlay, showLabel,
}: SystemNodeProps) => {
    const isOwned = !!sys.ownerId;
    // The star AND its ownership/borders are common knowledge (always shown). "contentsKnown"
    // gates only the deeper intel you learn by scanning: garrisons, structures, tags, heat.
    const contentsKnown = revealStage === 'scanned' || revealStage === 'surveyed';
    const star = classifyStar(sys);
    const size = systemSize(sys, isCapital);
    const brightness = revealBrightness(revealStage, isOwned, isCapital);
    // Overlay heat is intel — only tint the core when the system's contents are known.
    const coreColor = (activeOverlay && contentsKnown) ? styles.fill : star.core;
    const groupOpacity = isSelected ? 1 : brightness;

    const showOwner = isOwned;         // ownership/flag is public
    const showCapital = isCapital;     // capital status is public
    const relColor = relationship ? RELATIONSHIP_COLORS[relationship] : null;
    const tagMark = dominantTagVisual(sys.tags);
    // Phenomena (nebula, black hole, …) are drawn big by the dedicated layer, so don't
    // also mark them with a small glyph here.
    const showTag = !!tagMark && (contentsKnown || OBSERVABLE_TAGS.has(tagMark.tag)) && !PHENOMENA_TAGS.has(tagMark.tag);

    return (
        <g
            transform={`translate(${px.x}, ${px.y})`}
            onClick={(e) => { e.stopPropagation(); onSelect(sys.id); }}
            style={{ cursor: 'pointer', opacity: groupOpacity }}
        >
            {/* Territory tint + click target (owner tint only when scanned) */}
            <polygon
                points={hexPoints}
                fill={showOwner ? `${ownerColor}14` : 'transparent'}
                stroke={isSelected ? 'var(--color-neon-blue)' : showOwner ? `${ownerColor}44` : 'transparent'}
                strokeWidth={isSelected ? 1.5 : 0.75}
            />

            <g pointerEvents="none">
                {/* Glow halo (always — the star is visible) */}
                <circle r={size.glow} fill={`url(#glow-${star.key})`} className="gx-breathe" />

                {/* Uncharted cue: unscanned, unowned systems get a faint neutral ring */}
                {!contentsKnown && !isOwned && (
                    <circle r={size.core + 3} fill="none" stroke="#475569"
                        strokeWidth={0.5} strokeDasharray="1.5 3" opacity={0.35} />
                )}

                {/* Ownership halo — faction's own colour (tells factions apart) */}
                {showOwner && (
                    <circle r={size.core + 3.5} fill="none" stroke={ownerColor}
                        strokeWidth={1} opacity={0.6} className="gx-breathe-slow" />
                )}

                {/* Relationship ring — friend/foe (mine=green, ally=blue, neutral=grey, hostile=red) */}
                {showOwner && relColor && (
                    <circle r={size.core + 5.5} fill="none" stroke={relColor}
                        strokeWidth={0.9} opacity={0.7}
                        strokeDasharray={relationship === 'hostile' ? '2 2' : undefined} />
                )}

                {/* Capital cinematic rings (scanned) */}
                {showCapital && (
                    <>
                        <circle r={size.core + 6} fill="none" stroke="#ffd700" strokeWidth={1}
                            strokeDasharray="3 4" opacity={0.85} className="gx-spin-slow" />
                        <circle r={size.core + 9} fill="none" stroke="#facc15" strokeWidth={0.5}
                            strokeDasharray="1 6" opacity={0.5} className="gx-spin-rev" />
                    </>
                )}

                {/* Star core (by class) */}
                {star.dark ? (
                    <>
                        <circle r={size.core} fill={star.core} />
                        <circle r={size.core + 2.6} fill="none" stroke={star.ring} strokeWidth={1}
                            strokeDasharray="2 3" opacity={0.85} className="gx-spin" />
                    </>
                ) : star.binary ? (
                    <>
                        <circle cx={-size.core * 0.55} r={size.core * 0.62} fill={coreColor}
                            filter={!isMobile ? 'url(#hex-glow)' : undefined} />
                        <circle cx={size.core * 0.55} r={size.core * 0.48} fill={coreColor} />
                    </>
                ) : (
                    <circle r={size.core} fill={coreColor}
                        filter={!isMobile ? 'url(#hex-glow)' : undefined} />
                )}

                {/* Neutron / pulsar signature ring (astronomical — always) */}
                {star.ring && !star.dark && (
                    <circle r={size.core + 1.7} fill="none" stroke={star.ring}
                        strokeWidth={0.7} opacity={0.8} className="gx-pulse-ring" />
                )}

                {/* Feature-tag marker — contents hidden until scanned, except observable ones */}
                {showTag && tagMark && (
                    <g>
                        {tagMark.v.ring && (
                            <circle r={size.core + 5} fill="none" stroke={tagMark.v.color}
                                strokeWidth={0.8} strokeDasharray="2 2" opacity={0.75}
                                className="gx-spin-slow" />
                        )}
                        <text
                            textAnchor="middle"
                            y={-(size.glow * 0.4 + 3)}
                            fontSize={6}
                            fill={tagMark.v.color}
                            style={{ paintOrder: 'stroke', stroke: '#020617', strokeWidth: 0.7 }}
                        >
                            {tagMark.v.icon}
                        </text>
                    </g>
                )}

                {/* Selection — dominate attention */}
                {isSelected && (
                    <>
                        <circle r={size.core + 4} fill="none" stroke="var(--color-neon-blue)"
                            strokeWidth={1.4} className="gx-select-ring" />
                        <circle r={size.core + 4} fill="none" stroke="#7dd3fc"
                            strokeWidth={0.9} className="gx-select-ring2" />
                    </>
                )}

                {/* Contested marker (only when you can see the conflict) */}
                {contested && contentsKnown && (
                    <polygon
                        points={hexPoints}
                        fill="none"
                        stroke="#f97316"
                        strokeWidth={1.5}
                        strokeDasharray="3 2"
                        opacity={0.75}
                        className="gx-spin"
                    />
                )}

                {/* Label (zoomed in or selected) */}
                {(showLabel || isSelected) && (
                    <text
                        textAnchor="middle"
                        y={size.glow * 0.45 + 7}
                        fontSize={5.5}
                        fill={isSelected ? '#e0f2fe' : '#94a3b8'}
                        opacity={isSelected ? 1 : 0.75}
                        style={{ paintOrder: 'stroke', stroke: '#020617', strokeWidth: 0.6 }}
                    >
                        {sys.name || sys.id}
                    </text>
                )}
            </g>
        </g>
    );
}, (prev, next) => {
    return (
        prev.sys.id === next.sys.id &&
        prev.sys.instability === next.sys.instability &&
        prev.sys.tradeValue === next.sys.tradeValue &&
        prev.sys.escalationLevel === next.sys.escalationLevel &&
        prev.sys.security === next.sys.security &&
        prev.sys.ownerId === next.sys.ownerId &&
        prev.sys.tags?.join(',') === next.sys.tags?.join(',') &&
        prev.px.x === next.px.x &&
        prev.px.y === next.px.y &&
        prev.isSelected === next.isSelected &&
        prev.revealStage === next.revealStage &&
        prev.contested === next.contested &&
        prev.isMobile === next.isMobile &&
        prev.hexPoints === next.hexPoints &&
        prev.isCapital === next.isCapital &&
        prev.ownerColor === next.ownerColor &&
        prev.relationship === next.relationship &&
        prev.activeOverlay === next.activeOverlay &&
        prev.showLabel === next.showLabel &&
        prev.styles.fill === next.styles.fill &&
        prev.styles.opacity === next.styles.opacity
    );
});

SystemNode.displayName = 'SystemNode';

export default SystemNode;
