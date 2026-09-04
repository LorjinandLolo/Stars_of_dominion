// lib/ui/format.ts
// Display formatting for numbers the simulation hands the client.
//
// Stability, satisfaction and their cousins are stored as JSON strings in
// TEXT columns and drift through many small float multiplications per tick,
// so by the time they reach a React node they look like 85.92000000000007.
// Every label that shows one of them goes through here so the noise never
// reaches the screen and every panel agrees on the precision.

/**
 * Formats a 0–100 scale value as `92.345%`. Coerces with Number(); anything
 * that is not a finite number (undefined, null, NaN, Infinity, junk strings)
 * renders as an em dash. Nothing is clamped — the scale is the caller's
 * business, this only decides how the digits look.
 */
export function formatPercent(value: unknown, digits = 3): string {
    // Number(null) is 0, which would print a missing stat as "0.000%".
    if (value === null || value === undefined) return '—';
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    return `${n.toFixed(digits)}%`;
}

/** Three decimals — the product-owner standard for stability and satisfaction. */
export const pct3 = (v: unknown): string => formatPercent(v, 3);

/** One decimal — for secondary gauges (happiness, unrest, pressure, cohesion). */
export const pct1 = (v: unknown): string => formatPercent(v, 1);
