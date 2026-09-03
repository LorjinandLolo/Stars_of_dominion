"use client";

// components/units/UnitIcon.tsx
// One glyph per unit type, drawn in the lucide idiom (24-unit grid, 1.75
// stroke, currentColor) so they sit next to the rest of the UI's icons instead
// of the emoji placeholders. Ground units read as silhouettes-with-a-weapon,
// hulls as wedges that grow heavier with class, stations as rings.

import React from 'react';

export type UnitIconType =
    | 'INFANTRY' | 'ARMOR' | 'ARTILLERY' | 'ANTI_ARMOR' | 'AIRBORNE' | 'SPECIAL_OPS' | 'MILITIA' | 'ELDER_INFERNOID'
    | 'CORVETTE' | 'DESTROYER' | 'CRUISER' | 'BATTLESHIP' | 'STATION' | 'DEFENSE_PLATFORM';

const GLYPHS: Record<UnitIconType, React.ReactNode> = {
    // ── Ground ────────────────────────────────────────────────────────────
    INFANTRY: (
        <>
            {/* helmet */}
            <path d="M8 8a4 4 0 0 1 8 0v1H8z" />
            <path d="M7 9h10" />
            {/* torso */}
            <path d="M9 12h6l1 8H8z" />
            {/* rifle */}
            <path d="M15 14l5-4" />
            <path d="M17 12l1 1" />
        </>
    ),
    ARMOR: (
        <>
            {/* barrel + turret */}
            <path d="M12 9h9" />
            <path d="M8 9h4v3H8z" />
            {/* hull */}
            <path d="M5 12h14l1 3H4z" />
            {/* tracks */}
            <rect x="3" y="15" width="18" height="4" rx="2" />
            <path d="M7 17h.01M12 17h.01M17 17h.01" />
        </>
    ),
    ARTILLERY: (
        <>
            {/* long barrel angled up */}
            <path d="M8 14L20 4" />
            <path d="M18 3l2 2" />
            {/* carriage */}
            <path d="M5 14h9l-2 4H6z" />
            {/* wheel */}
            <circle cx="8" cy="18" r="2.5" />
            <path d="M12 20h6" />
        </>
    ),
    ANTI_ARMOR: (
        <>
            {/* launcher tube */}
            <path d="M4 16L18 6" />
            <path d="M6 18L20 8" />
            {/* rocket */}
            <path d="M17 5l3-1-1 3" />
            {/* grip */}
            <path d="M9 14l-1 5" />
            <path d="M14 11l2 3" />
        </>
    ),
    AIRBORNE: (
        <>
            {/* canopy */}
            <path d="M4 10a8 8 0 0 1 16 0" />
            <path d="M4 10c2 1 4 1 4 0M8 10c2 1 4 1 4 0M12 10c2 1 4 1 4 0M16 10c2 1 4 1 4 0" />
            {/* lines */}
            <path d="M5 10l7 8 7-8" />
            {/* trooper */}
            <circle cx="12" cy="18" r="1" />
            <path d="M12 19v2" />
        </>
    ),
    SPECIAL_OPS: (
        <>
            {/* reticle */}
            <circle cx="12" cy="12" r="6" />
            <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
            {/* dagger through the centre */}
            <path d="M9 15l6-6" />
            <path d="M14 9l1 1M9 15l-1 1" />
        </>
    ),
    MILITIA: (
        <>
            {/* figure */}
            <circle cx="10" cy="6" r="2" />
            <path d="M8 10h4l1 10H7z" />
            {/* pitchfork */}
            <path d="M17 20V8" />
            <path d="M15 8v-3M17 8V4M19 8V5" />
            <path d="M15 8h4" />
        </>
    ),
    ELDER_INFERNOID: (
        <>
            {/* towering body */}
            <path d="M10 21V9l2-4 2 4v12" />
            <path d="M8 21h8" />
            {/* arms */}
            <path d="M10 12l-4 3M14 12l4 3" />
            {/* flame crown */}
            <path d="M12 5c-1-2 0-3 0-3s1 1 0 3" />
            <path d="M9 7c-1-1 0-2 0-2M15 7c1-1 0-2 0-2" />
        </>
    ),
    // ── Space ─────────────────────────────────────────────────────────────
    CORVETTE: (
        <>
            {/* small arrowhead */}
            <path d="M12 3l5 14-5-3-5 3z" />
            <path d="M12 14v4" />
        </>
    ),
    DESTROYER: (
        <>
            {/* long wedge with fins */}
            <path d="M12 2l3 12v5l-3-2-3 2v-5z" />
            <path d="M9 14l-4 3v2l4-2M15 14l4 3v2l-4-2" />
        </>
    ),
    CRUISER: (
        <>
            {/* hull */}
            <path d="M12 3l4 8v9l-4-2-4 2v-9z" />
            {/* twin nacelles */}
            <path d="M8 12l-4 1v6l4-1M16 12l4 1v6l-4-1" />
            <path d="M12 8v8" />
        </>
    ),
    BATTLESHIP: (
        <>
            {/* heavy hull */}
            <path d="M12 2l5 7v10l-5-2-5 2V9z" />
            {/* broad wings */}
            <path d="M7 11l-5 3v5l5-2M17 11l5 3v5l-5-2" />
            {/* turrets */}
            <circle cx="12" cy="9" r="1.2" />
            <circle cx="12" cy="14" r="1.2" />
        </>
    ),
    STATION: (
        <>
            <circle cx="12" cy="12" r="8" />
            <circle cx="12" cy="12" r="2.5" />
            <path d="M12 4v5.5M12 14.5V20M4 12h5.5M14.5 12H20" />
        </>
    ),
    DEFENSE_PLATFORM: (
        <>
            {/* hex platform */}
            <path d="M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9z" />
            {/* cannon */}
            <circle cx="12" cy="13" r="2.5" />
            <path d="M12 10.5V6" />
        </>
    ),
};

export const UNIT_ICON_TYPES = Object.keys(GLYPHS) as UnitIconType[];

export function hasUnitIcon(type: string): type is UnitIconType {
    return type in GLYPHS;
}

export default function UnitIcon({
    type, size = 24, className = '', strokeWidth = 1.75, title,
}: { type: string; size?: number; className?: string; strokeWidth?: number; title?: string }) {
    const glyph = hasUnitIcon(type) ? GLYPHS[type] : (
        // Unknown type: a plain crate, not a question mark.
        <>
            <rect x="4" y="6" width="16" height="14" rx="2" />
            <path d="M4 11h16M12 6v14" />
        </>
    );
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
            role={title ? 'img' : undefined}
            aria-label={title}
            aria-hidden={title ? undefined : true}
        >
            {title && <title>{title}</title>}
            {glyph}
        </svg>
    );
}
