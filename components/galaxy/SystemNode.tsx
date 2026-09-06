"use client";

import React, { memo } from 'react';
import { classifyStar, systemSize, revealBrightness, dominantTagVisual, OBSERVABLE_TAGS, PHENOMENA_TAGS, RELATIONSHIP_COLORS } from './starVisuals';
import type { Relationship } from './starVisuals';
import type { OverlaySystemStyle } from '@/lib/galaxy/overlays';

interface SystemNodeProps {
    sys: any;
    px: { x: number; y: number };
    isSelected: boolean;
    revealStage: string;
    /**
     * The active overlay's verdict for this system (lib/galaxy/overlays.ts),
     * or null when no overlay is on or the overlay has nothing to say here.
     * It paints the HEX only — the star core always keeps its class colour.
     */
    overlay: OverlaySystemStyle | null;
    /** Hover line for the hex under Charted ('PING 550cr · 2 jumps from …'). */
    overlayHint?: string | null;
    contested: boolean;
    isMobile: boolean;
    hexPoints: string;
    onSelect: (id: string) => void;
    /** Right-click: issue an order targeting this system (e.g. fleet move). */
    onOrder?: (id: string) => void;
    /** A friendly fleet is selected — this system is a valid move target. */
    targeting?: boolean;
    isCapital: boolean;
    ownerColor: string;
    relationship: Relationship | null;
    showLabel: boolean;
}

const SystemNode = memo(({
    sys, px, isSelected, revealStage, overlay, overlayHint, contested, isMobile, hexPoints, onSelect, onOrder,
    targeting, isCapital, ownerColor, relationship, showLabel,
}: SystemNodeProps) => {
    const isOwned = !!sys.ownerId;
    // The star AND its ownership/borders are common knowledge (always shown). "contentsKnown"
    // gates only the deeper intel you learn by scanning: garrisons, structures, tags, heat.
    const contentsKnown = revealStage === 'scanned' || revealStage === 'surveyed';
    const star = classifyStar(sys);
    const size = systemSize(sys, isCapital);
    const brightness = revealBrightness(revealStage, isOwned, isCapital);
    const groupOpacity = isSelected ? 1 : brightness;

    const showOwner = isOwned;         // ownership/flag is public
    const showCapital = isCapital;     // capital status is public
    const relColor = relationship ? RELATIONSHIP_COLORS[relationship] : null;
    const tagMark = dominantTagVisual(sys.tags);
    // Phenomena (nebula, black hole, …) are drawn big by the dedicated layer, so don't
    // also mark them with a small glyph here.
    const showTag = !!tagMark && (contentsKnown || OBSERVABLE_TAGS.has(tagMark.tag)) && !PHENOMENA_TAGS.has(tagMark.tag);

    // The hex is also the click target, so an overlay with "no fill" still
    // needs a paintable (transparent) fill or clicks would fall through it.
    const hexFill = overlay
        ? (overlay.fill === 'none' ? 'transparent' : overlay.fill)
        : (showOwner ? `${ownerColor}14` : 'transparent');
    const hexStroke = isSelected
        ? 'var(--color-neon-blue)'
        : overlay
            ? (overlay.stroke ?? 'transparent')
            : (showOwner ? `${ownerColor}44` : 'transparent');
    const hexStrokeWidth = isSelected ? 1.5 : overlay ? (overlay.strokeWidth ?? 1) : 0.75;

    return (
        <g
            transform={`translate(${px.x}, ${px.y})`}
            onClick={(e) => { e.stopPropagation(); onSelect(sys.id); }}
            onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                (onOrder ?? onSelect)(sys.id);
            }}
            style={{ cursor: targeting ? 'crosshair' : 'pointer', opacity: groupOpacity }}
        >
            {overlayHint && <title>{overlayHint}</title>}

            {/* Territory tint + click target. With an overlay on, the hex carries
                the overlay's verdict instead of the baseline owner tint. */}
            <polygon
                points={hexPoints}
                fill={hexFill}
                fillOpacity={overlay ? overlay.fillOpacity : undefined}
                stroke={hexStroke}
                strokeOpacity={overlay && !isSelected ? overlay.strokeOpacity : undefined}
                strokeWidth={hexStrokeWidth}
                strokeDasharray={overlay && !isSelected ? overlay.dash : undefined}
                className={overlay?.pulse ? 'gx-breathe' : undefined}
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

                {/* Star core (by class) — never tinted by an overlay */}
                {star.dark ? (
                    <>
                        <circle r={size.core} fill={star.core} />
                        <circle r={size.core + 2.6} fill="none" stroke={star.ring} strokeWidth={1}
                            strokeDasharray="2 3" opacity={0.85} className="gx-spin" />
                    </>
                ) : star.binary ? (
                    <>
                        <circle cx={-size.core * 0.55} r={size.core * 0.62} fill={star.core}
                            filter={!isMobile ? 'url(#hex-glow)' : undefined} />
                        <circle cx={size.core * 0.55} r={size.core * 0.48} fill={star.core} />
                    </>
                ) : (
                    <circle r={size.core} fill={star.core}
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

                {/* Overlay ring — the asteroid-belt mark (Charted, Relations):
                    rocks and dust round the star, outside the ownership and
                    relationship halos, inside the capital's outer ring. */}
                {overlay?.ring && (
                    <circle r={size.core + 7.5} fill="none" stroke={overlay.ring}
                        strokeWidth={0.8} strokeDasharray="1 1.5" opacity={0.85}
                        className="gx-spin-slow" />
                )}

                {/* Overlay count badge (Settle sites, pirate influence) — top-LEFT
                    vertex; the FOB marker owns top-right. */}
                {overlay?.badge && (
                    <g transform="translate(-9, -9)">
                        <circle
                            r={3}
                            fill={overlay.badge.hollow ? '#020617' : overlay.badge.color}
                            fillOpacity={overlay.badge.hollow ? 0.7 : 1}
                            stroke={overlay.badge.hollow ? overlay.badge.color : '#020617'}
                            strokeWidth={0.5}
                        />
                        <text
                            textAnchor="middle"
                            y={1.4}
                            fontSize={4}
                            fontFamily="monospace"
                            fontWeight={700}
                            fill={overlay.badge.hollow ? overlay.badge.color : '#052e16'}
                        >
                            {overlay.badge.count}
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
    const a = prev.overlay, b = next.overlay;
    const sameOverlay = a === b || (!!a && !!b &&
        a.fill === b.fill &&
        a.fillOpacity === b.fillOpacity &&
        a.stroke === b.stroke &&
        a.strokeOpacity === b.strokeOpacity &&
        a.strokeWidth === b.strokeWidth &&
        a.dash === b.dash &&
        a.pulse === b.pulse &&
        a.ring === b.ring &&
        a.badge?.count === b.badge?.count &&
        a.badge?.color === b.badge?.color &&
        a.badge?.hollow === b.badge?.hollow);
    return (
        sameOverlay &&
        prev.overlayHint === next.overlayHint &&
        prev.sys.id === next.sys.id &&
        prev.sys.ownerId === next.sys.ownerId &&
        prev.sys.tags?.join(',') === next.sys.tags?.join(',') &&
        prev.px.x === next.px.x &&
        prev.px.y === next.px.y &&
        prev.isSelected === next.isSelected &&
        prev.targeting === next.targeting &&
        prev.revealStage === next.revealStage &&
        prev.contested === next.contested &&
        prev.isMobile === next.isMobile &&
        prev.hexPoints === next.hexPoints &&
        prev.isCapital === next.isCapital &&
        prev.ownerColor === next.ownerColor &&
        prev.relationship === next.relationship &&
        prev.showLabel === next.showLabel
    );
});

SystemNode.displayName = 'SystemNode';

export default SystemNode;
