// lib/combat/siege/moments.ts
//
// The decisions a battle throws up. When a cycle's fighting crosses a line —
// a district falls with the enemy reeling beyond it, a formation is cut off,
// a handful hold a strongpoint against the odds, the enemy breaks next door —
// the commander on that side gets a moment: two or three choices, answered
// before the next cycle resolves. Nobody is punished for being away: an
// unanswered moment takes its default, which is what the standing doctrine
// would have done anyway.
//
// Effects are real and short: a move order, a stance, a one-cycle strength
// buff in one district (a DistrictBuff, passed to the district battle as a
// modifier by the worker), entrenchment, organisation, or a surrender.
// Pure over the board.

import type { PlanetSurface } from '../../planet-surface/types';
import type { DistrictWarState, GroundUnitType } from './siege-types';
import type { Formation, FormationSide } from './formations';
import { formationsAt } from './formations';
import { buildAdjacency, CAPITAL_SECTOR, controllerOf, isPassable } from './district-front';
import type { DistrictReport } from './battle-beats';

export type MomentKind = 'breakthrough' | 'pocket' | 'last_stand' | 'counterattack';

export interface MomentChoice {
    id: string;
    label: string;
    blurb: string;
}

export interface GroundMoment {
    id: string;
    kind: MomentKind;
    side: FormationSide;
    sector: number;
    formationIds: string[];
    title: string;
    text: string;
    choices: MomentChoice[];
    defaultChoice: string;
    /** Cycle it was raised after; it resolves at the start of the next. */
    cycle: number;
    /** The cycle it is applied at the start of — the answer must be in before it resolves. */
    deadlineCycle: number;
    chosen?: string;
    /** Set when applied: what was actually done (chosen or default). */
    resolved?: string;
}

/**
 * A one-cycle strength multiplier for one side in one district: a breakout,
 * a last stand, smoke. Consumed by the worker's district loop on `cycle`;
 * never stored.
 */
export interface DistrictBuff {
    sector: number;
    side: FormationSide;
    mult: number;
    cycle: number;
    reason: string;
}

/** Moments raised per side per cycle, at most — the rest is the doctrine's job. */
export const MOMENTS_PER_SIDE = 2;

const BUFF = {
    exploit: 1.15,
    breakOut: 1.25,
    lastStand: 1.3,
    counterattack: 1.1,
};

const other = (s: FormationSide): FormationSide => s === 'attacker' ? 'defender' : 'attacker';
const menIn = (fs: Formation[]) => fs.reduce((s, f) => s + Math.max(0, f.strength), 0);

/** Choices per moment kind; the first listed is NOT necessarily the default. */
const CHOICES: Record<MomentKind, { choices: MomentChoice[]; def: string }> = {
    breakthrough: {
        def: 'consolidate',
        choices: [
            { id: 'exploit', label: 'Exploit', blurb: 'Push on into the weakest district beyond, +15% there. Costs organisation.' },
            { id: 'consolidate', label: 'Consolidate', blurb: 'Dig in on the new ground and catch breath.' },
        ],
    },
    pocket: {
        def: 'hold',
        choices: [
            { id: 'break_out', label: 'Break out', blurb: 'Fight toward friendly lines, +25% for the attempt.' },
            { id: 'hold', label: 'Hold for relief', blurb: 'Dig in and ration what is left. Starvation slows for a cycle.' },
            { id: 'surrender', label: 'Surrender', blurb: 'Lay down arms now. The men live, as prisoners.' },
        ],
    },
    last_stand: {
        def: 'to_the_last',
        choices: [
            { id: 'to_the_last', label: 'To the last', blurb: '+30% and no breaking this cycle. Nobody leaves.' },
            { id: 'fall_back', label: 'Fall back', blurb: 'Give up the district and save the men.' },
        ],
    },
    counterattack: {
        def: 'hold',
        choices: [
            { id: 'counterattack', label: 'Counterattack', blurb: 'Hit the reeling enemy now, +10%, in assault stance.' },
            { id: 'hold', label: 'Hold the line', blurb: 'Stay put and let them come.' },
        ],
    },
};

/**
 * Moments raised by this cycle's fighting. `reports` are the district reports
 * the cycle produced; each moment is answered before the next cycle resolves.
 */
export function detectMoments(
    surface: PlanetSurface,
    war: DistrictWarState,
    formations: Formation[],
    reports: DistrictReport[],
    cycle: number,
    strongpointSectors: number[] = [],
): GroundMoment[] {
    const adjacency = buildAdjacency(surface);
    const out: GroundMoment[] = [];
    const count = { attacker: 0, defender: 0 };
    const add = (m: Omit<GroundMoment, 'id' | 'choices' | 'defaultChoice' | 'cycle' | 'deadlineCycle'>) => {
        if (count[m.side] >= MOMENTS_PER_SIDE) return;
        if (!m.formationIds.length) return;
        if (out.some(o => o.sector === m.sector && o.side === m.side)) return;
        count[m.side]++;
        const c = CHOICES[m.kind];
        out.push({ ...m, id: `${m.kind}-${cycle}-${m.side}-${m.sector}`, choices: c.choices, defaultChoice: c.def, cycle, deadlineCycle: cycle + 1 });
    };
    const enemyNext = (idx: number, side: FormationSide) =>
        adjacency[idx].filter(n => isPassable(surface.sectors[n]) && controllerOf(war, n) !== side);

    // Pockets first: men about to starve matter most.
    const pocketed = new Map<string, Formation[]>();
    for (const f of formations) {
        if (f.strength <= 0 || !f.encircled) continue;
        const key = `${f.side}:${f.sectorIndex}`;
        pocketed.set(key, [...(pocketed.get(key) ?? []), f]);
    }
    for (const [key, fs] of pocketed) {
        const [side, idx] = key.split(':') as [FormationSide, string];
        add({ kind: 'pocket', side, sector: Number(idx), formationIds: fs.map(f => f.id),
            title: `Cut off in district ${idx}`,
            text: `${menIn(fs)} men are surrounded with no line home. Supply is running out.` });
    }

    for (const r of reports) {
        const holderForms = formationsAt(formations, r.sector, r.holder);
        // A district fell and there is more enemy ground right behind it.
        if (r.captured && enemyNext(r.sector, r.holder).length) {
            add({ kind: 'breakthrough', side: r.holder, sector: r.sector, formationIds: holderForms.map(f => f.id),
                title: `Breakthrough at district ${r.sector}`,
                text: `District ${r.sector} has fallen. The enemy beyond is shaken — push on, or dig in?` });
        }
        // Outnumbered on ground worth dying for.
        const worth = r.sector === CAPITAL_SECTOR || strongpointSectors.includes(r.sector);
        const enemyLeft = menIn(formationsAt(formations, r.sector, other(r.holder)));
        if (!r.captured && worth && enemyLeft > 0 && menIn(holderForms) < enemyLeft * 0.6) {
            add({ kind: 'last_stand', side: r.holder, sector: r.sector, formationIds: holderForms.map(f => f.id),
                title: `Last stand at district ${r.sector}`,
                text: `${menIn(holderForms)} men hold against ${enemyLeft}. They will break soon unless ordered otherwise.` });
        }
        // The loser broke: whoever has pieces next to where they fled can hit them.
        if (r.lost[other(r.holder)] > 0 && r.beats.some(b => b.kind === 'rout' && b.side === other(r.holder))) {
            const loser = other(r.holder);
            // Districts the routed side holds next to this fight, thinly.
            for (const n of adjacency[r.sector]) {
                if (controllerOf(war, n) !== loser || !isPassable(surface.sectors[n])) continue;
                const theirs = menIn(formationsAt(formations, n, loser));
                const ours = adjacency[n].flatMap(m => formationsAt(formations, m, r.holder)).filter(f => f.sectorIndex !== n);
                if (!ours.length || menIn(ours) < theirs * 1.2) continue;
                add({ kind: 'counterattack', side: r.holder, sector: n, formationIds: ours.map(f => f.id),
                    title: `The enemy reels at district ${n}`,
                    text: `They broke at district ${r.sector} and fell back into ${n} with ${theirs} men. Hit them now?` });
                break;
            }
        }
    }
    return out;
}

export interface MomentApplyResult {
    log: string[];
    buffs: DistrictBuff[];
    /** Men who laid down their arms by choice, by side and type. */
    surrendered: Record<FormationSide, Partial<Record<GroundUnitType, number>>>;
}

/**
 * Applies every open moment — the chosen answer, or the default — at the
 * start of `cycle`, before moves resolve. Returns the district buffs for
 * this cycle and any chosen surrender; marks each moment resolved.
 */
export function applyMoments(
    surface: PlanetSurface,
    war: DistrictWarState,
    formations: Formation[],
    moments: GroundMoment[],
    cycle: number,
): MomentApplyResult {
    const adjacency = buildAdjacency(surface);
    const res: MomentApplyResult = { log: [], buffs: [], surrendered: { attacker: {}, defender: {} } };
    for (const m of moments) {
        if (m.resolved) continue;
        const answer = m.choices.some(c => c.id === m.chosen) ? m.chosen! : m.defaultChoice;
        m.resolved = answer;
        const forms = formations.filter(f => m.formationIds.includes(f.id) && f.strength > 0);
        if (!forms.length) continue;
        const enemy = other(m.side);
        const weakestEnemyNext = (from: number) => adjacency[from]
            .filter(n => isPassable(surface.sectors[n]) && controllerOf(war, n) === enemy)
            .map(n => ({ n, men: menIn(formationsAt(formations, n, enemy)) }))
            .sort((a, b) => a.men - b.men)[0]?.n;
        const friendlyNext = (from: number) => adjacency[from]
            .filter(n => isPassable(surface.sectors[n]) && controllerOf(war, n) === m.side)
            .sort((a, b) => menIn(formationsAt(formations, b, m.side)) - menIn(formationsAt(formations, a, m.side)))[0];
        const label = m.choices.find(c => c.id === answer)?.label ?? answer;
        const said = m.chosen ? label : `${label} (no orders)`;

        switch (`${m.kind}:${answer}`) {
            case 'breakthrough:exploit': {
                const target = weakestEnemyNext(m.sector);
                if (target == null) break;
                for (const f of forms) {
                    f.moveTo = target; f.path = []; f.stance = 'AGGRESSIVE_ASSAULT';
                    f.organization = Math.max(0, (f.organization ?? 100) - 10);
                }
                res.buffs.push({ sector: target, side: m.side, mult: BUFF.exploit, cycle, reason: 'Exploiting' });
                res.log.push(`District ${m.sector}: ${said} — the advance rolls on into district ${target}.`);
                break;
            }
            case 'breakthrough:consolidate': {
                (war.entrenchment ??= {})[m.sector] = Math.min(100, (war.entrenchment[m.sector] ?? 0) + 15);
                for (const f of forms) f.organization = Math.min(100, (f.organization ?? 100) + 10);
                res.log.push(`District ${m.sector}: ${said} — the new ground is dug in.`);
                break;
            }
            case 'pocket:break_out': {
                // Toward the nearest district our side holds, through whatever is in the way.
                const target = friendlyNext(m.sector) ?? weakestEnemyNext(m.sector);
                if (target == null) break;
                for (const f of forms) { f.moveTo = target; f.path = []; f.stance = 'AGGRESSIVE_ASSAULT'; }
                res.buffs.push({ sector: target, side: m.side, mult: BUFF.breakOut, cycle, reason: 'Breaking out' });
                res.log.push(`District ${m.sector}: ${said} — the pocket fights toward district ${target}.`);
                break;
            }
            case 'pocket:hold': {
                for (const f of forms) { f.supply = Math.min(100, f.supply + 25); f.moveTo = null; f.path = []; }
                (war.entrenchment ??= {})[m.sector] = Math.min(100, (war.entrenchment[m.sector] ?? 0) + 10);
                res.log.push(`District ${m.sector}: ${said} — the pocket rations and digs in.`);
                break;
            }
            case 'pocket:surrender': {
                const men = menIn(forms);
                for (const f of forms) {
                    res.surrendered[f.side][f.unitType] = (res.surrendered[f.side][f.unitType] ?? 0) + f.strength;
                    f.strength = 0;
                }
                res.log.push(`District ${m.sector}: ${said} — ${men} men lay down their arms.`);
                break;
            }
            case 'last_stand:to_the_last': {
                for (const f of forms) {
                    f.moveTo = null; f.path = []; f.stance = 'DEFENSIVE_HOLD';
                    f.organization = Math.max(f.organization ?? 100, 45);
                }
                res.buffs.push({ sector: m.sector, side: m.side, mult: BUFF.lastStand, cycle, reason: 'Last stand' });
                res.log.push(`District ${m.sector}: ${said} — nobody leaves.`);
                break;
            }
            case 'last_stand:fall_back': {
                const target = friendlyNext(m.sector);
                if (target == null) break;
                for (const f of forms) { f.moveTo = target; f.path = []; }
                res.log.push(`District ${m.sector}: ${said} — the defenders pull back to district ${target}.`);
                break;
            }
            case 'counterattack:counterattack': {
                for (const f of forms) { f.moveTo = m.sector; f.path = []; f.stance = 'AGGRESSIVE_ASSAULT'; }
                res.buffs.push({ sector: m.sector, side: m.side, mult: BUFF.counterattack, cycle, reason: 'Counterattack' });
                res.log.push(`District ${m.sector}: ${said} — the reserve goes in.`);
                break;
            }
            case 'counterattack:hold':
            default:
                break;
        }
    }
    return res;
}
