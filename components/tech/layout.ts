import type { Tech } from '@/lib/tech/types';
import { TechTier } from '@/lib/tech/types';

// One source of truth for node geometry. The old tree hard-coded 160px cards on
// a 120px column step, so neighbours physically overlapped; the step now leaves
// a real gutter between cards in both axes.
export const NODE_W = 176;
export const NODE_H = 84;
export const X_STEP = 224;
export const Y_STEP = 136;
export const PAD = 48;
/** Sticky left gutter that carries the tier labels beside the canvas. */
export const GUTTER_W = 44;

export interface GridOffset { x: number; y: number }
export interface Rect { x: number; y: number; w: number; h: number }
export interface TierBand { tier: TechTier; top: number; height: number }

export const TIER_NAMES: Record<TechTier, string> = {
    [TechTier.FOUNDATION]: 'Foundation',
    [TechTier.EXPANSION]: 'Expansion',
    [TechTier.SPECIALIZATION]: 'Specialization',
    [TechTier.DOMINANCE]: 'Dominance',
    [TechTier.TRANSFORMATION]: 'Transformation',
};

export const TIER_NUMERALS: Record<TechTier, string> = {
    [TechTier.FOUNDATION]: '0',
    [TechTier.EXPANSION]: 'I',
    [TechTier.SPECIALIZATION]: 'II',
    [TechTier.DOMINANCE]: 'III',
    [TechTier.TRANSFORMATION]: 'IV',
};

const px = (t: Tech) => t.position?.x ?? 0;
const py = (t: Tech) => t.position?.y ?? 0;

/** Smallest grid coordinates in the set, so a tree that starts at x=3 still hugs the left edge. */
export function gridOffset(techs: Tech[]): GridOffset {
    if (techs.length === 0) return { x: 0, y: 0 };
    return { x: Math.min(...techs.map(px)), y: Math.min(...techs.map(py)) };
}

export function nodeRect(tech: Tech, offset: GridOffset): Rect {
    return {
        x: PAD + (px(tech) - offset.x) * X_STEP,
        y: PAD + (py(tech) - offset.y) * Y_STEP,
        w: NODE_W,
        h: NODE_H,
    };
}

export function canvasSize(techs: Tech[], offset: GridOffset = gridOffset(techs)): { w: number; h: number } {
    if (techs.length === 0) return { w: PAD * 2 + NODE_W, h: PAD * 2 + NODE_H };
    const maxX = Math.max(...techs.map(px)) - offset.x;
    const maxY = Math.max(...techs.map(py)) - offset.y;
    return {
        w: PAD * 2 + maxX * X_STEP + NODE_W,
        h: PAD * 2 + maxY * Y_STEP + NODE_H,
    };
}

// Bands reach half a row-gap past their outermost nodes so adjacent tiers abut
// instead of leaving a bare strip between them. Exported because the connector
// layer routes same-row edges through this gap, so both must agree on its size.
export const ROW_GAP_HALF = (Y_STEP - NODE_H) / 2;

/**
 * Vertical extent of each tier, measured from the nodes that actually carry it.
 * When authored positions let two tiers overlap, the shared region is split at
 * its midpoint so the labels never stack.
 */
export function tierBands(techs: Tech[], offset: GridOffset): TierBand[] {
    const range = new Map<TechTier, { min: number; max: number }>();
    for (const tech of techs) {
        const r = nodeRect(tech, offset);
        const cur = range.get(tech.tier);
        if (!cur) {
            range.set(tech.tier, { min: r.y, max: r.y + r.h });
        } else {
            cur.min = Math.min(cur.min, r.y);
            cur.max = Math.max(cur.max, r.y + r.h);
        }
    }

    const sorted = [...range.entries()]
        .sort((a, b) => a[1].min - b[1].min)
        .map(([tier, { min, max }]) => ({ tier, top: min - ROW_GAP_HALF, bottom: max + ROW_GAP_HALF }));

    for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1];
        const cur = sorted[i];
        if (cur.top < prev.bottom) {
            const mid = (cur.top + prev.bottom) / 2;
            prev.bottom = mid;
            cur.top = mid;
        }
    }

    return sorted.map(b => ({ tier: b.tier, top: b.top, height: b.bottom - b.top }));
}
