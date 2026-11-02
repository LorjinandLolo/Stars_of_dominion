// lib/tech/crash-program.ts
// Stars of Dominion — pay to finish one project sooner. A slot on a crash program
// advances CRASH_SPEED times as fast until its tech lands. One at a time per
// empire, so credits buy a shortcut to the next tech, not the whole tree. The
// price covers only the work left. Client-safe and pure.

export const CRASH_SPEED = 4;
/** Credits per hour of research cost, for a whole project. */
export const CRASH_CREDITS_PER_HOUR = 25;

export function crashCost(researchCost: number, ticksCompleted = 0, ticksRequired = 0): number {
    const left = ticksRequired > 0 ? Math.max(0, 1 - ticksCompleted / ticksRequired) : 1;
    return Math.ceil(researchCost * CRASH_CREDITS_PER_HOUR * left);
}
