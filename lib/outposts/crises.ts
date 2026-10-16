// lib/outposts/crises.ts
// Stars of Dominion — what goes wrong on an outpost, and the answers
// (docs/outposts/README.md). A crisis opens with two or three options and a
// deadline; unanswered, the steward answers (the governor's sensible choice,
// or the passive one with no governor). Pure apart from the context the
// worker passes in for world effects.

import type { RNG } from '../trade-system/rng';
import type { OpenCrisis, CrisisOption, OutpostState } from './outpost-types';
import { MODULES, CRISIS_DEADLINE_SHIFTS, MAX_OPEN_CRISES } from './outpost-catalog';
import { countModules, log, moduleActive, moduleBuilt } from './outpost-sim';

export interface CrisisContext {
    rng: RNG;
    hasGovernor: boolean;
    /** Pay from the empire's reserves; false (and nothing taken) if short. */
    charge(cost: Record<string, number>): boolean;
    prisoners: number;
    /** Remove a share of the prisoners held here (riot, escape, experiments). Returns how many. */
    losePrisoners(share: number, how: 'escaped' | 'killed'): number;
    /** Add research progress (hours) to the empire's current project. Returns its name, or null. */
    researchBoost(hours: number): string | null;
    /** Hours equal to one experiment's worth on the current project. */
    experimentHours(): number;
    /** Armed enemies at war in this system or next door. */
    raidersNear: boolean;
}

interface CrisisDef {
    kind: string;
    weight(state: OutpostState, ctx: CrisisContext): number;
    open(state: OutpostState, ctx: CrisisContext): Omit<OpenCrisis, 'id' | 'kind' | 'openedShift' | 'deadlineShift'> | null;
    resolve(state: OutpostState, ctx: CrisisContext, option: string, crisis: OpenCrisis): void;
}

// ── helpers ──────────────────────────────────────────────────────────────────

const opt = (id: string, label: string, detail: string): CrisisOption => ({ id, label, detail });

function cellsWith(state: OutpostState, pred: (id: string) => boolean): number[] {
    return state.cells.map((c, i) => (c.module && pred(c.module) && moduleBuilt(state, i) ? i : -1)).filter(i => i >= 0);
}

function moraleFx(state: OutpostState, value: number, shifts: number): void {
    state.effects.push({ kind: 'morale', value, untilShift: state.shift + shifts });
}

function kill(state: OutpostState, n: number): number {
    const k = Math.min(state.colonists, n);
    state.colonists -= k;
    state.stats.deaths += k;
    return k;
}

function knockOut(state: OutpostState, cell: number, shifts: number): void {
    state.cells[cell].downUntilShift = Math.max(state.cells[cell].downUntilShift ?? 0, state.shift + shifts);
}

function destroy(state: OutpostState, cell: number): void {
    const c = state.cells[cell];
    delete c.module; delete c.off; delete c.downUntilShift; delete c.buildDoneShift;
}

const nameAt = (state: OutpostState, cell?: number) => (cell !== undefined && state.cells[cell]?.module ? MODULES[state.cells[cell].module!].name : 'the module');

/** Pay, or fall back to the passive answer when the treasury is short. */
function payOr(state: OutpostState, ctx: CrisisContext, cost: Record<string, number>, onShort: () => void, what: string): boolean {
    if (ctx.charge(cost)) return true;
    log(state, `No money for ${what}.`, 'bad');
    onShort();
    return false;
}

// ── the catalog ──────────────────────────────────────────────────────────────

const CRISES: CrisisDef[] = [
    {
        kind: 'dust_storm',
        weight: s => (countModules(s, 'solar') > 0 ? 3 : 0),
        open: () => ({
            title: 'Dust storm',
            text: 'A wall of dust is rolling over the plain. The solar arrays will be at a fraction of their output for three shifts.',
            options: [
                opt('ride', 'Ride it out', 'Solar at 40% for 3 shifts.'),
                opt('burn', 'Burn reserve fuel', '300 energy from your reserves keeps the lights on.'),
                opt('dark', 'Shut down to essentials', 'Everything but life support and food off for 3 shifts; morale −5.'),
            ],
            fallback: 'ride', steward: 'burn',
        }),
        resolve: (s, ctx, o) => {
            if (o === 'burn' && payOr(s, ctx, { ENERGY: 300 }, () => {}, 'reserve fuel')) { log(s, 'Generators roared through the storm.', 'good'); return; }
            if (o === 'dark') {
                s.cells.forEach((c, i) => { if (c.module && !['life_support', 'hydroponics', 'hub', 'solar', 'geothermal', 'reactor'].includes(c.module)) knockOut(s, i, 3); });
                moraleFx(s, -5, 3);
                log(s, 'The outpost went dark to weather the storm.', 'neutral');
                return;
            }
            s.effects.push({ kind: 'solar_down', value: 1, untilShift: s.shift + 3 });
            log(s, 'The storm choked the solar arrays.', 'bad');
        },
    },
    {
        kind: 'meteor_shower',
        weight: s => (s.cells.filter(c => c.module && c.module !== 'hub').length >= 2 ? 2 : 0),
        open: (s, ctx) => {
            const targets = cellsWith(s, id => id !== 'hub' && id !== 'bunker');
            if (!targets.length) return null;
            const cell = targets[ctx.rng.nextInt(0, targets.length - 1)];
            const bunker = countModules(s, 'bunker') > 0;
            return {
                title: 'Meteor shower',
                text: `Tracking shows a debris swarm crossing the outpost. ${nameAt(s, cell)} is in the strike zone.`,
                cell,
                options: [
                    opt('shelter', bunker ? 'Into the bunker' : 'Brace and hope', bunker ? 'Nobody hurt; the module is knocked out 2 shifts.' : 'The module is likely wrecked; colonists may die.'),
                    opt('shield', 'Rig debris shields', '400 metals; the module takes a scratch.'),
                    opt('evacuate', 'Evacuate the zone', 'Module knocked out 3 shifts; morale −3.'),
                ],
                fallback: 'shelter', steward: bunker ? 'shelter' : 'shield',
            };
        },
        resolve: (s, ctx, o, c) => {
            const cell = c.cell!;
            if (!s.cells[cell]?.module) return;
            if (o === 'shield' && payOr(s, ctx, { METALS: 400 }, () => {}, 'debris shields')) { knockOut(s, cell, 1); log(s, `Shields held over ${nameAt(s, cell)}.`, 'good'); return; }
            if (o === 'evacuate') { knockOut(s, cell, 3); moraleFx(s, -3, 2); log(s, `${nameAt(s, cell)} was evacuated and battered.`, 'neutral'); return; }
            if (countModules(s, 'bunker') > 0) { knockOut(s, cell, 2); log(s, `Everyone sat it out in the bunker. ${nameAt(s, cell)} took hits.`, 'neutral'); return; }
            const name = nameAt(s, cell);
            if (ctx.rng.check(0.6)) { destroy(s, cell); log(s, `A strike flattened ${name}.`, 'bad'); }
            else { knockOut(s, cell, 2); log(s, `${name} was holed but stands.`, 'bad'); }
            const dead = ctx.rng.check(0.4) ? kill(s, 1) : 0;
            if (dead) log(s, 'One colonist was caught outside.', 'bad');
        },
    },
    {
        kind: 'air_leak',
        weight: s => (s.colonists >= 4 ? 2 : 0),
        open: () => ({
            title: 'Hull breach',
            text: 'A seal has failed somewhere in the domes and the air reserve is bleeding out.',
            options: [
                opt('seal', 'Seal off the section', 'A habitat is closed for 2 shifts.'),
                opt('repair', 'Emergency repair', '300 credits; fixed now.'),
                opt('volunteers', 'Send volunteers', 'Free, but somebody may not come back.'),
            ],
            fallback: 'none', steward: 'repair',
        }),
        resolve: (s, ctx, o) => {
            if (o === 'repair' && payOr(s, ctx, { CREDITS: 300 }, () => s.effects.push({ kind: 'air_leak', value: 2, untilShift: s.shift + 3 }), 'repairs')) { log(s, 'The breach was patched.', 'good'); return; }
            if (o === 'seal') {
                const habs = cellsWith(s, id => id === 'habitat');
                if (habs.length) { knockOut(s, habs[0], 2); log(s, 'A dome was sealed off until the breach is found.', 'neutral'); return; }
            }
            if (o === 'volunteers') {
                if (ctx.rng.check(0.35)) { kill(s, 1); log(s, 'The breach was sealed. One volunteer did not make it back.', 'bad'); }
                else log(s, 'Volunteers found and sealed the breach.', 'good');
                return;
            }
            s.effects.push({ kind: 'air_leak', value: 2, untilShift: s.shift + 3 });
            log(s, 'Nobody stopped the leak. Air is draining.', 'bad');
        },
    },
    {
        kind: 'sickness',
        weight: s => (s.colonists >= 6 ? 2 : 0),
        open: s => ({
            title: 'Fever in the domes',
            text: 'A fever is spreading through the bunks. The recycled air carries it everywhere.',
            options: [
                opt('quarantine', 'Quarantine', 'Nobody dies; morale −10 for 3 shifts.'),
                opt('treat', countModules(s, 'medbay') > 0 ? 'Treat in the medbay' : 'Ship in medicine', countModules(s, 'medbay') > 0 ? '100 credits.' : '600 credits.'),
                opt('ignore', 'Keep working', 'A tenth of the colonists may die.'),
            ],
            fallback: 'ignore', steward: 'treat',
        }),
        resolve: (s, ctx, o) => {
            const medbay = countModules(s, 'medbay') > 0;
            if (o === 'treat' && payOr(s, ctx, { CREDITS: medbay ? 100 : 600 }, () => {}, 'medicine')) { log(s, 'The fever broke under treatment.', 'good'); return; }
            if (o === 'quarantine') { moraleFx(s, -10, 3); log(s, 'The sick were walled off. Nobody died; nobody was happy.', 'neutral'); return; }
            const dead = kill(s, Math.max(1, Math.round(s.colonists * (medbay ? 0.05 : 0.1))));
            moraleFx(s, -5, 2);
            log(s, `The fever burned through the outpost. ${dead} dead.`, 'bad');
        },
    },
    {
        kind: 'reactor_fault',
        weight: s => (countModules(s, 'reactor') > 0 ? 2 : 0),
        open: s => ({
            title: 'Reactor fault',
            text: 'The reactor’s coolant loop is reading wrong. The engineers want a decision.',
            cell: cellsWith(s, id => id === 'reactor')[0],
            options: [
                opt('scram', 'Scram it', 'Reactor off for 3 shifts.'),
                opt('patch', 'Patch it live', '400 metals; a 20% chance it goes badly.'),
                opt('ignore', 'Run it', 'A 40% chance of a meltdown.'),
            ],
            fallback: 'scram', steward: 'scram',
        }),
        resolve: (s, ctx, o, c) => {
            const cell = c.cell;
            if (cell === undefined || s.cells[cell]?.module !== 'reactor') return;
            if (o === 'scram') { knockOut(s, cell, 3); log(s, 'The reactor was shut down for inspection.', 'neutral'); return; }
            const risk = o === 'patch' && ctx.charge({ METALS: 400 }) ? 0.2 : 0.4;
            if (ctx.rng.check(risk)) {
                destroy(s, cell);
                const dead = kill(s, 2);
                moraleFx(s, -15, 4);
                log(s, `The reactor melted down. ${dead} dead, and the dome around it is gone.`, 'bad');
            } else log(s, 'The reactor held.', 'good');
        },
    },
    {
        kind: 'supply_delay',
        weight: s => (s.food < 8 ? 2 : 1),
        open: () => ({
            title: 'Supply run delayed',
            text: 'The freighter with the next food shipment has been held up. The stores will run short.',
            options: [
                opt('ration', 'Ration', 'Food −4; morale −8 for 3 shifts.'),
                opt('premium', 'Pay for a fast courier', '500 credits; nothing lost.'),
            ],
            fallback: 'ration', steward: 'premium',
        }),
        resolve: (s, ctx, o) => {
            if (o === 'premium' && payOr(s, ctx, { CREDITS: 500 }, () => {}, 'a courier')) { log(s, 'A courier brought the shipment through.', 'good'); return; }
            s.food = Math.max(0, s.food - 4);
            moraleFx(s, -8, 3);
            log(s, 'Half rations until the next run.', 'bad');
        },
    },
    {
        kind: 'strike',
        weight: s => (countModules(s, 'mine') > 0 && s.morale < 55 ? 3 : 0),
        open: () => ({
            title: 'The miners down tools',
            text: 'The extractor crews say the shifts are too long and the pay too thin. Nothing is coming out of the ground until someone listens.',
            options: [
                opt('pay', 'Raise their pay', '400 credits; morale +10 for 3 shifts.'),
                opt('break', 'Break the strike', 'Mines run; morale −15 for 4 shifts.'),
                opt('wait', 'Wait them out', 'Mines idle 3 shifts.'),
            ],
            fallback: 'wait', steward: 'pay',
        }),
        resolve: (s, ctx, o) => {
            if (o === 'pay' && payOr(s, ctx, { CREDITS: 400 }, () => s.effects.push({ kind: 'mines_down', value: 1, untilShift: s.shift + 3 }), 'the pay rise')) { moraleFx(s, 10, 3); log(s, 'The crews took the raise and went back down.', 'good'); return; }
            if (o === 'break') { moraleFx(s, -15, 4); log(s, 'The strike was broken. The crews went back sullen.', 'bad'); return; }
            s.effects.push({ kind: 'mines_down', value: 1, untilShift: s.shift + 3 });
            log(s, 'The extractors stand idle.', 'bad');
        },
    },
    {
        kind: 'riot',
        weight: (s, ctx) => (ctx.prisoners > 0 ? (s.prisonLabour ? 4 : 2) : 0),
        open: () => ({
            title: 'Riot in the cell blocks',
            text: 'The prisoners have taken a wing and are holding two wardens.',
            options: [
                opt('lockdown', 'Lock down and starve them out', 'Morale −5; a few may slip out.'),
                opt('negotiate', 'Negotiate', '300 credits; it ends quietly.'),
                opt('storm', 'Storm the wing', 'Fast. A tenth of them die, and their homeland hears of it.'),
            ],
            fallback: 'lockdown', steward: 'negotiate',
        }),
        resolve: (s, ctx, o) => {
            if (o === 'negotiate' && payOr(s, ctx, { CREDITS: 300 }, () => {}, 'a settlement')) { log(s, 'The riot ended at the table.', 'good'); return; }
            if (o === 'storm') { const n = ctx.losePrisoners(0.1, 'killed'); log(s, `Guards stormed the wing. ${n} prisoners died.`, 'bad'); return; }
            moraleFx(s, -5, 2);
            const n = ctx.losePrisoners(ctx.rng.check(0.5) ? 0.08 : 0, 'escaped');
            log(s, n ? `The lockdown held, mostly: ${n} prisoners escaped.` : 'The lockdown held.', n ? 'bad' : 'neutral');
        },
    },
    {
        kind: 'lab_accident',
        weight: s => (countModules(s, 'test_lab') > 0 ? 1 : 0),
        open: s => ({
            title: 'Containment alarm',
            text: 'Something in the test lab is not behaving. The scientists think they are close to something.',
            cell: cellsWith(s, id => id === 'test_lab')[0],
            options: [
                opt('contain', 'Seal the lab', 'Lab off for 2 shifts.'),
                opt('vent', 'Vent everything', 'Safe; the run is lost.'),
                opt('push', 'Push on', 'Half the time a breakthrough; half the time two dead.'),
            ],
            fallback: 'contain', steward: 'contain',
        }),
        resolve: (s, ctx, o, c) => {
            if (o === 'push') {
                if (ctx.rng.check(0.5)) {
                    const tech = ctx.researchBoost(ctx.experimentHours() * 2);
                    log(s, tech ? `Breakthrough: ${tech} leapt ahead.` : 'Breakthrough, but there was nothing to apply it to.', 'good');
                } else { const d = kill(s, 2); log(s, `The lab went up. ${d} dead.`, 'bad'); if (c.cell !== undefined) knockOut(s, c.cell, 3); }
                return;
            }
            if (o === 'vent') { log(s, 'The lab was vented. The run is lost, everyone is fine.', 'neutral'); return; }
            if (c.cell !== undefined) knockOut(s, c.cell, 2);
            log(s, 'The lab was sealed until it calms down.', 'neutral');
        },
    },
    {
        kind: 'rich_vein',
        weight: s => (countModules(s, 'mine') > 0 ? 2 : 0),
        open: () => ({
            title: 'A rich seam',
            text: 'The extractor crews have broken into a seam far richer than the survey promised.',
            options: [
                opt('dig', 'Dig it out fast', 'Extractors +100% for 2 shifts; morale −3.'),
                opt('steady', 'Work it properly', 'Extractors +40% for 6 shifts.'),
                opt('sell', 'Sell the claim', '800 credits now.'),
            ],
            fallback: 'steady', steward: 'steady',
        }),
        resolve: (s, ctx, o) => {
            if (o === 'sell') { ctx.charge({ CREDITS: -800 }); log(s, 'The claim sold for 800 credits.', 'good'); return; }
            if (o === 'dig') { s.effects.push({ kind: 'output_boost', value: 1, untilShift: s.shift + 2 }); moraleFx(s, -3, 2); log(s, 'Double shifts on the seam.', 'good'); return; }
            s.effects.push({ kind: 'output_boost', value: 0.4, untilShift: s.shift + 6 });
            log(s, 'The seam is being worked steadily.', 'good');
        },
    },
    {
        kind: 'ruins',
        weight: s => (s.cells.some((c, i) => c.terrain === 'ruin' && !c.module && s.tier >= 1 && i >= 0) ? 1 : 0),
        open: s => ({
            title: 'Something under the dust',
            text: 'Survey drones have found worked stone at the edge of the outpost. Nobody here made it.',
            cell: s.cells.findIndex(c => c.terrain === 'ruin'),
            options: [
                opt('excavate', 'Excavate', '300 credits; what is found goes to your research.'),
                opt('sell', 'Sell the site to collectors', '600 credits.'),
                opt('leave', 'Leave it buried', 'Nothing.'),
            ],
            fallback: 'leave', steward: 'excavate',
        }),
        resolve: (s, ctx, o) => {
            const cell = s.cells.findIndex(c => c.terrain === 'ruin');
            if (o === 'sell') { ctx.charge({ CREDITS: -600 }); if (cell >= 0) s.cells[cell].terrain = 'flat'; log(s, 'Collectors paid 600 credits and took the stones away.', 'neutral'); return; }
            if (o === 'excavate' && payOr(s, ctx, { CREDITS: 300 }, () => {}, 'the dig')) {
                const tech = ctx.researchBoost(ctx.experimentHours() * 3);
                log(s, tech ? `The dig turned up notes that pushed ${tech} forward.` : 'The dig turned up curiosities, nothing more.', 'good');
                return;
            }
            log(s, 'The ruins stay buried.', 'neutral');
        },
    },
    {
        kind: 'homesick',
        weight: s => (s.morale < 45 && s.colonists >= 4 ? 3 : 0),
        open: () => ({
            title: 'They want to go home',
            text: 'A petition is going round the bunks. A good number of colonists want passage back.',
            options: [
                opt('festival', 'Throw a festival', '300 credits; morale +15 for 3 shifts.'),
                opt('promise', 'Make promises', 'Morale +6 now, −10 later.'),
                opt('let_go', 'Let them go', 'Three colonists leave.'),
            ],
            fallback: 'let_go', steward: 'festival',
        }),
        resolve: (s, ctx, o) => {
            if (o === 'festival' && payOr(s, ctx, { CREDITS: 300 }, () => {}, 'a festival')) { moraleFx(s, 15, 3); log(s, 'A festival lifted the outpost’s spirits.', 'good'); return; }
            if (o === 'promise') {
                moraleFx(s, 6, 2);
                s.effects.push({ kind: 'morale', value: -10, untilShift: s.shift + 6 });
                log(s, 'Promises were made.', 'neutral');
                return;
            }
            const gone = Math.min(3, s.colonists - 1);
            s.colonists -= Math.max(0, gone);
            log(s, `${gone} colonists took passage home.`, 'bad');
        },
    },
    {
        kind: 'raiders',
        weight: (s, ctx) => (ctx.raidersNear ? 4 : 0),
        open: (s, ctx) => {
            const targets = cellsWith(s, id => id !== 'hub' && id !== 'bunker');
            return {
                title: 'Raiders overhead',
                text: 'Enemy ships are in the system and one has turned toward the outpost.',
                cell: targets.length ? targets[ctx.rng.nextInt(0, targets.length - 1)] : undefined,
                options: [
                    opt('dark', 'Go dark', 'Everything off for a shift; they may pass.'),
                    opt('pay', 'Pay them off', '500 credits.'),
                    opt('shelter', countModules(s, 'bunker') > 0 ? 'Into the bunker' : 'Take cover', countModules(s, 'bunker') > 0 ? 'Nobody hurt; a module is hit.' : 'A module is wrecked; people may die.'),
                ],
                fallback: 'shelter', steward: 'dark',
            };
        },
        resolve: (s, ctx, o, c) => {
            if (o === 'pay' && payOr(s, ctx, { CREDITS: 500 }, () => {}, 'a pay-off')) { log(s, 'The raiders took the money and left.', 'neutral'); return; }
            if (o === 'dark') {
                s.cells.forEach((cell, i) => { if (cell.module && cell.module !== 'hub' && cell.module !== 'life_support') knockOut(s, i, 1); });
                if (ctx.rng.check(0.7)) { log(s, 'The outpost went dark and the raiders passed it by.', 'good'); return; }
                log(s, 'The raiders were not fooled.', 'bad');
            }
            if (c.cell === undefined || !s.cells[c.cell]?.module) return;
            if (countModules(s, 'bunker') > 0) { knockOut(s, c.cell, 2); log(s, `Everyone sheltered. The raiders shot up ${nameAt(s, c.cell)}.`, 'bad'); return; }
            const name = nameAt(s, c.cell);
            destroy(s, c.cell);
            const d = ctx.rng.check(0.5) ? kill(s, 1) : 0;
            log(s, `Raiders wrecked ${name}${d ? ' and killed a colonist' : ''}.`, 'bad');
        },
    },
];

const BY_KIND = new Map(CRISES.map(c => [c.kind, c]));
export const CRISIS_KINDS = CRISES.map(c => c.kind);

/** Chance per shift that something goes wrong. */
export const CRISIS_CHANCE = 0.25;

/** Maybe open a crisis this shift. */
export function rollCrisis(state: OutpostState, ctx: CrisisContext): OpenCrisis | null {
    if (state.graduated || state.shift < 2 || state.crises.length >= MAX_OPEN_CRISES) return null;
    if (!ctx.rng.check(CRISIS_CHANCE)) return null;
    const open = new Set(state.crises.map(c => c.kind));
    const pool = CRISES.map(def => ({ def, w: open.has(def.kind) ? 0 : def.weight(state, ctx) })).filter(x => x.w > 0);
    const total = pool.reduce((s, x) => s + x.w, 0);
    if (!total) return null;
    let roll = ctx.rng.next() * total;
    let chosen = pool[0].def;
    for (const x of pool) { roll -= x.w; if (roll < 0) { chosen = x.def; break; } }
    const body = chosen.open(state, ctx);
    if (!body) return null;
    const crisis: OpenCrisis = {
        id: `${chosen.kind}-${state.shift}`,
        kind: chosen.kind,
        openedShift: state.shift,
        deadlineShift: state.shift + CRISIS_DEADLINE_SHIFTS,
        ...body,
    };
    state.crises.push(crisis);
    state.stats.crisesFaced += 1;
    log(state, `${crisis.title}!`, 'bad');
    return crisis;
}

/** Open a specific crisis now (an experiment gone wrong), if it is not already open. */
export function openCrisisOfKind(state: OutpostState, ctx: CrisisContext, kind: string): OpenCrisis | null {
    const def = BY_KIND.get(kind);
    if (!def || state.crises.some(c => c.kind === kind)) return null;
    const body = def.open(state, ctx);
    if (!body) return null;
    const crisis: OpenCrisis = { id: `${kind}-${state.shift}`, kind, openedShift: state.shift, deadlineShift: state.shift + CRISIS_DEADLINE_SHIFTS, ...body };
    state.crises.push(crisis);
    state.stats.crisesFaced += 1;
    log(state, `${crisis.title}!`, 'bad');
    return crisis;
}

/** Answer an open crisis. Returns false when it is not open or the answer is unknown. */
export function resolveCrisis(state: OutpostState, ctx: CrisisContext, crisisId: string, optionId: string, by: 'player' | 'steward' = 'player'): boolean {
    const crisis = state.crises.find(c => c.id === crisisId);
    if (!crisis) return false;
    const def = BY_KIND.get(crisis.kind);
    if (!def) { state.crises = state.crises.filter(c => c !== crisis); return false; }
    if (optionId !== 'none' && !crisis.options.some(o => o.id === optionId)) return false;
    state.crises = state.crises.filter(c => c !== crisis);
    if (by === 'steward') log(state, `No orders came on "${crisis.title}"; ${ctx.hasGovernor ? 'the governor' : 'the crew'} chose for you.`, 'neutral');
    def.resolve(state, ctx, optionId, crisis);
    return true;
}

/** Crises past their deadline are answered by the steward. */
export function expireCrises(state: OutpostState, ctx: CrisisContext): void {
    for (const c of [...state.crises]) {
        if (c.deadlineShift > state.shift) continue;
        resolveCrisis(state, ctx, c.id, ctx.hasGovernor ? c.steward : c.fallback, 'steward');
    }
}

export { moduleActive };
