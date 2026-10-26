// lib/outposts/crises.ts
// Stars of Dominion — what goes wrong on an outpost, and the answers
// (docs/outposts/README.md). A crisis opens with two or three options and a
// deadline; unanswered, the steward answers (the governor's sensible choice,
// or the passive one with no governor). Pure apart from the context the
// worker passes in for world effects.

import type { RNG } from '../trade-system/rng';
import type { OpenCrisis, CrisisOption, OutpostState, ScarKind, ColonistTrait } from './outpost-types';
import { MODULES, CRISIS_DEADLINE_SHIFTS, MAX_OPEN_CRISES } from './outpost-catalog';
import { countModules, log, moduleActive, moduleBuilt } from './outpost-sim';
import { ensureRoster, hasTrait, withTrait, pickColonist, killColonists, leaveColonists, hurtColonist, listNames, roster } from './colonists';

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

/** Deaths by name (colonists.ts). Returns the names, for the log. */
function kill(state: OutpostState, n: number, how: string, rng: RNG, prefer?: ColonistTrait): string[] {
    return killColonists(state, n, how, rng, prefer);
}

// ── scars: what an answer leaves behind ───────────────────────────────────────

/** How long each scar lasts untended, in shifts. */
const SCAR_SHIFTS: Record<ScarKind, number> = {
    sealed_dome: 6, patched_reactor: 8, sullen_crews: 8, bad_blood: 10, broken_promise: 6, unburied: 4,
};

export function hasScar(state: OutpostState, kind: ScarKind): boolean {
    return !!state.scars?.some(s => s.kind === kind && s.untilShift > state.shift);
}

function scar(state: OutpostState, kind: ScarKind, text: string, cell?: number): void {
    ensureRoster(state);
    state.scars = (state.scars ?? []).filter(s => s.kind !== kind);
    state.scars.push({ kind, sinceShift: state.shift, untilShift: state.shift + SCAR_SHIFTS[kind], cell, text });
}

function clearScar(state: OutpostState, kind: ScarKind): boolean {
    const before = state.scars?.length ?? 0;
    state.scars = (state.scars ?? []).filter(s => s.kind !== kind);
    return (state.scars.length) < before;
}

/** A body outside: until it is buried the outpost does not settle. */
function unburied(state: OutpostState, names: string[]): void {
    if (names.length) scar(state, 'unburied', `${listNames(names)} ${names.length === 1 ? 'lies' : 'lie'} unburied.`);
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
            const who = pickColonist(s, ctx.rng);
            return {
                title: 'Meteor shower',
                text: `Tracking shows a debris swarm crossing the outpost. ${nameAt(s, cell)} is in the strike zone${who ? `, and ${who.name} is on shift in it` : ''}.`,
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
            if (ctx.rng.check(0.4)) { const dead = kill(s, 1, 'caught outside in the meteor shower', ctx.rng); log(s, `${listNames(dead)} was caught outside.`, 'bad'); unburied(s, dead); }
            else { const hurt = pickColonist(s, ctx.rng); if (hurt) { hurtColonist(s, hurt); log(s, `${hurt.name} was hurt by the debris.`, 'bad'); } }
        },
    },
    {
        kind: 'air_leak',
        // A dome sealed and never mended fails again.
        weight: s => (s.colonists >= 4 ? (hasScar(s, 'sealed_dome') ? 4 : 2) : 0),
        open: s => {
            const engineer = withTrait(s, 'engineer');
            return {
                title: hasScar(s, 'sealed_dome') ? 'The sealed dome is leaking again' : 'Hull breach',
                text: hasScar(s, 'sealed_dome')
                    ? 'The section you sealed never got a proper fix. The patch has let go and the air reserve is bleeding out again.'
                    : 'A seal has failed somewhere in the domes and the air reserve is bleeding out.',
                options: [
                    opt('seal', 'Seal off the section', 'A habitat is closed for 2 shifts; it stays a weak point.'),
                    opt('repair', 'Emergency repair', '300 credits; fixed properly.'),
                    opt('volunteers', engineer ? `Send ${engineer.name} in` : 'Send volunteers', engineer ? 'An engineer comes back.' : 'Free, but somebody may not come back.'),
                ],
                fallback: 'none', steward: 'repair',
            };
        },
        resolve: (s, ctx, o) => {
            if (o === 'repair' && payOr(s, ctx, { CREDITS: 300 }, () => s.effects.push({ kind: 'air_leak', value: 2, untilShift: s.shift + 3 }), 'repairs')) {
                log(s, clearScar(s, 'sealed_dome') ? 'The breach was patched, and the old weak section with it.' : 'The breach was patched.', 'good');
                return;
            }
            if (o === 'seal') {
                const habs = cellsWith(s, id => id === 'habitat');
                if (habs.length) { knockOut(s, habs[0], 2); scar(s, 'sealed_dome', 'A dome is sealed with the breach unmended.', habs[0]); log(s, 'A dome was sealed off. The breach is still in there.', 'neutral'); return; }
            }
            if (o === 'volunteers') {
                const engineer = withTrait(s, 'engineer');
                if (engineer) { log(s, `${engineer.name} found the breach and sealed it properly.`, 'good'); clearScar(s, 'sealed_dome'); return; }
                const who = pickColonist(s, ctx.rng);
                if (ctx.rng.check(0.35)) { const dead = kill(s, 1, 'lost sealing a hull breach', ctx.rng); log(s, `The breach was sealed. ${listNames(dead)} did not make it back.`, 'bad'); }
                else log(s, `${who?.name ?? 'Volunteers'} found and sealed the breach.`, 'good');
                return;
            }
            s.effects.push({ kind: 'air_leak', value: 2, untilShift: s.shift + 3 });
            scar(s, 'sealed_dome', 'A breach nobody mended.');
            log(s, 'Nobody stopped the leak. Air is draining.', 'bad');
        },
    },
    {
        kind: 'sickness',
        weight: s => (s.colonists >= 6 ? 2 : 0),
        open: (s, ctx) => {
            const first = pickColonist(s, ctx.rng);
            if (first) hurtColonist(s, first, 'sick');
            const care = countModules(s, 'medbay') > 0 || hasTrait(s, 'medic');
            const medic = withTrait(s, 'medic');
            return {
                title: 'Fever in the domes',
                text: `${first ? `${first.name} went down with a fever this shift and three more are coughing` : 'A fever is spreading through the bunks'}. The recycled air carries it everywhere.`,
                options: [
                    opt('quarantine', 'Quarantine', 'Nobody dies; morale −10 for 3 shifts.'),
                    opt('treat', countModules(s, 'medbay') > 0 ? 'Treat in the medbay' : medic ? `Let ${medic.name} treat it` : 'Ship in medicine', care ? '100 credits.' : '600 credits.'),
                    opt('ignore', 'Keep working', care ? 'A twentieth of the colonists may die.' : 'A tenth of the colonists may die.'),
                ],
                fallback: 'ignore', steward: 'treat',
            };
        },
        resolve: (s, ctx, o) => {
            const care = countModules(s, 'medbay') > 0 || hasTrait(s, 'medic', false);
            if (o === 'treat' && payOr(s, ctx, { CREDITS: care ? 100 : 600 }, () => {}, 'medicine')) { for (const c of roster(s)) if (c.status === 'sick') { c.status = 'well'; c.sinceShift = s.shift; } log(s, 'The fever broke under treatment.', 'good'); return; }
            if (o === 'quarantine') { moraleFx(s, -10, 3); log(s, 'The sick were walled off. Nobody died; nobody was happy.', 'neutral'); return; }
            const dead = kill(s, Math.max(1, Math.round(s.colonists * (care ? 0.05 : 0.1))), 'taken by the fever', ctx.rng);
            moraleFx(s, -5, 2);
            log(s, `The fever burned through the outpost. ${listNames(dead)} ${dead.length === 1 ? 'is' : 'are'} dead.`, 'bad');
        },
    },
    {
        kind: 'reactor_fault',
        // A live patch is a loan against the next fault.
        weight: s => (countModules(s, 'reactor') > 0 ? (hasScar(s, 'patched_reactor') ? 4 : 2) : 0),
        open: s => {
            const engineer = withTrait(s, 'engineer');
            const patched = hasScar(s, 'patched_reactor');
            return {
                title: patched ? 'The patched reactor again' : 'Reactor fault',
                text: patched
                    ? 'The live patch on the coolant loop is weeping. The engineers say they told you so.'
                    : 'The reactor’s coolant loop is reading wrong. The engineers want a decision.',
                cell: cellsWith(s, id => id === 'reactor')[0],
                options: [
                    opt('scram', 'Scram it', 'Reactor off for 3 shifts; inspected properly.'),
                    opt('patch', engineer ? `${engineer.name} patches it live` : 'Patch it live', `400 metals; a ${engineer ? 10 : 20}% chance it goes badly, and it stays patched.`),
                    opt('ignore', 'Run it', `A ${patched ? 60 : 40}% chance of a meltdown.`),
                ],
                fallback: 'scram', steward: 'scram',
            };
        },
        resolve: (s, ctx, o, c) => {
            const cell = c.cell;
            if (cell === undefined || s.cells[cell]?.module !== 'reactor') return;
            if (o === 'scram') { knockOut(s, cell, 3); clearScar(s, 'patched_reactor'); log(s, 'The reactor was shut down and inspected properly.', 'neutral'); return; }
            const patching = o === 'patch' && ctx.charge({ METALS: 400 });
            const risk = patching ? (hasTrait(s, 'engineer') ? 0.1 : 0.2) : (hasScar(s, 'patched_reactor') ? 0.6 : 0.4);
            if (ctx.rng.check(risk)) {
                destroy(s, cell);
                clearScar(s, 'patched_reactor');
                const dead = kill(s, 2, 'killed in the reactor meltdown', ctx.rng, 'engineer');
                moraleFx(s, -15, 4);
                log(s, `The reactor melted down. ${listNames(dead)} ${dead.length === 1 ? 'is' : 'are'} dead, and the dome around it is gone.`, 'bad');
            } else if (patching) { scar(s, 'patched_reactor', 'The reactor runs on a live patch.', cell); log(s, 'The patch held. For now.', 'neutral'); }
            else log(s, 'The reactor held.', 'good');
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
            const botanist = withTrait(s, 'botanist');
            s.food = Math.max(0, s.food - (botanist ? 2 : 4));
            moraleFx(s, botanist ? -4 : -8, 3);
            log(s, botanist ? `Half rations until the next run; ${botanist.name} stretched the stores.` : 'Half rations until the next run.', 'bad');
        },
    },
    {
        kind: 'strike',
        weight: s => (countModules(s, 'mine') > 0 && s.morale < 55 ? (hasScar(s, 'sullen_crews') ? 5 : 3) : 0),
        open: s => ({
            title: 'The miners down tools',
            text: `${withTrait(s, 'miner', false)?.name ?? 'The extractor crews'} ${withTrait(s, 'miner', false) ? 'speaks for the crews: ' : 'say '}the shifts are too long and the pay too thin. Nothing is coming out of the ground until someone listens.${hasScar(s, 'sullen_crews') ? ' They have not forgotten the last time.' : ''}`,
            options: [
                opt('pay', 'Raise their pay', '400 credits; morale +10 for 3 shifts.'),
                opt('break', 'Break the strike', 'Mines run; morale −15 for 4 shifts.'),
                opt('wait', 'Wait them out', 'Mines idle 3 shifts.'),
            ],
            fallback: 'wait', steward: 'pay',
        }),
        resolve: (s, ctx, o) => {
            if (o === 'pay' && payOr(s, ctx, { CREDITS: 400 }, () => s.effects.push({ kind: 'mines_down', value: 1, untilShift: s.shift + 3 }), 'the pay rise')) { moraleFx(s, 10, 3); log(s, clearScar(s, 'sullen_crews') ? 'The crews took the raise, and the grudge with it.' : 'The crews took the raise and went back down.', 'good'); return; }
            if (o === 'break') { moraleFx(s, -15, 4); scar(s, 'sullen_crews', 'The crews went back under threat and remember it.'); log(s, 'The strike was broken. The crews went back sullen.', 'bad'); return; }
            s.effects.push({ kind: 'mines_down', value: 1, untilShift: s.shift + 3 });
            log(s, 'The extractors stand idle.', 'bad');
        },
    },
    {
        kind: 'riot',
        weight: (s, ctx) => (ctx.prisoners > 0 ? (s.prisonLabour ? 4 : 2) * (hasScar(s, 'bad_blood') ? 2 : 1) : 0),
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
            if (o === 'negotiate' && payOr(s, ctx, { CREDITS: 300 }, () => {}, 'a settlement')) { log(s, clearScar(s, 'bad_blood') ? 'The riot ended at the table, and the bad blood with it.' : 'The riot ended at the table.', 'good'); return; }
            if (o === 'storm') {
                const veteran = withTrait(s, 'veteran');
                const n = ctx.losePrisoners(veteran ? 0.05 : 0.1, 'killed');
                scar(s, 'bad_blood', 'The cell blocks remember the storming.');
                log(s, `${veteran ? `${veteran.name} led the guards in` : 'Guards stormed the wing'}. ${n} prisoners died.`, 'bad');
                return;
            }
            moraleFx(s, -5, 2);
            scar(s, 'bad_blood', 'The cell blocks remember being starved out.');
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
                if (ctx.rng.check(hasTrait(s, 'scholar') ? 0.65 : 0.5)) {
                    const tech = ctx.researchBoost(ctx.experimentHours() * 2);
                    log(s, tech ? `Breakthrough: ${tech} leapt ahead.` : 'Breakthrough, but there was nothing to apply it to.', 'good');
                } else { const d = kill(s, 2, 'killed when the test lab went up', ctx.rng, 'scholar'); log(s, `The lab went up. ${listNames(d)} ${d.length === 1 ? 'is' : 'are'} dead.`, 'bad'); if (c.cell !== undefined) knockOut(s, c.cell, 3); }
                return;
            }
            if (o === 'vent') { log(s, 'The lab was vented. The run is lost, everyone is fine.', 'neutral'); return; }
            if (c.cell !== undefined) knockOut(s, c.cell, 2);
            log(s, 'The lab was sealed until it calms down.', 'neutral');
        },
    },
    {
        kind: 'rich_vein',
        weight: s => (countModules(s, 'mine') > 0 ? (hasTrait(s, 'miner') ? 3 : 2) : 0),
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
            if (o === 'dig') { s.effects.push({ kind: 'output_boost', value: hasTrait(s, 'miner') ? 1.3 : 1, untilShift: s.shift + 2 }); moraleFx(s, -3, 2); log(s, 'Double shifts on the seam.', 'good'); return; }
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
        weight: s => (s.morale < 45 && s.colonists >= 4 ? (hasScar(s, 'broken_promise') ? 5 : hasTrait(s, 'zealot') ? 1 : 3) : 0),
        open: (s, ctx) => ({
            title: 'They want to go home',
            text: `${pickColonist(s, ctx.rng, undefined, roster(s).filter(c => c.trait === 'zealot').map(c => c.id))?.name ?? 'Someone'} is passing a petition round the bunks. A good number of colonists want passage back.${hasScar(s, 'broken_promise') ? ' They quote your last promise back at you.' : ''}`,
            options: [
                opt('festival', 'Throw a festival', '300 credits; morale +15 for 3 shifts.'),
                opt('promise', 'Make promises', 'Morale +6 now, −10 later.'),
                opt('let_go', 'Let them go', 'Three colonists leave.'),
            ],
            fallback: 'let_go', steward: 'festival',
        }),
        resolve: (s, ctx, o) => {
            if (o === 'festival' && payOr(s, ctx, { CREDITS: 300 }, () => {}, 'a festival')) { moraleFx(s, 15, 3); log(s, clearScar(s, 'broken_promise') ? 'A festival lifted the outpost’s spirits, and the old promise was forgiven.' : 'A festival lifted the outpost’s spirits.', 'good'); return; }
            if (o === 'promise') {
                moraleFx(s, 6, 2);
                s.effects.push({ kind: 'morale', value: -10, untilShift: s.shift + 6 });
                scar(s, 'broken_promise', 'Promises were made that nobody expects to be kept.');
                log(s, 'Promises were made.', 'neutral');
                return;
            }
            const gone = leaveColonists(s, Math.min(3, s.colonists - 1));
            log(s, `${listNames(gone)} took passage home.`, 'bad');
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
                if (ctx.rng.check(hasTrait(s, 'veteran') ? 0.85 : 0.7)) { log(s, `The outpost went dark${withTrait(s, 'veteran') ? ` under ${withTrait(s, 'veteran')!.name}'s drill` : ''} and the raiders passed it by.`, 'good'); return; }
                log(s, 'The raiders were not fooled.', 'bad');
            }
            if (c.cell === undefined || !s.cells[c.cell]?.module) return;
            if (countModules(s, 'bunker') > 0) { knockOut(s, c.cell, 2); log(s, `Everyone sheltered. The raiders shot up ${nameAt(s, c.cell)}.`, 'bad'); return; }
            const name = nameAt(s, c.cell);
            destroy(s, c.cell);
            const d = ctx.rng.check(0.5) ? kill(s, 1, 'shot by raiders', ctx.rng) : [];
            log(s, `Raiders wrecked ${name}${d.length ? ` and killed ${listNames(d)}` : ''}.`, 'bad');
            unburied(s, d);
        },
    },
    {
        // Broken crews pay you back.
        kind: 'sabotage',
        weight: s => (hasScar(s, 'sullen_crews') && countModules(s, 'mine', false) > 0 ? 3 : 0),
        open: (s, ctx) => {
            const mines = cellsWith(s, id => id === 'mine');
            if (!mines.length) return null;
            const cell = mines[ctx.rng.nextInt(0, mines.length - 1)];
            const veteran = withTrait(s, 'veteran');
            return {
                title: 'Sabotage in the extractor',
                text: 'Someone has cut the power couplings on an extractor in the night. The crews you broke are not saying who.',
                cell,
                options: [
                    opt('repair', 'Repair and say nothing', '200 metals; the grudge stays.'),
                    opt('search', veteran ? `Let ${veteran.name} find them` : 'Search the bunks', veteran ? 'The saboteur is found; the crews are cowed.' : 'A coin flip: the saboteur, or a wrong accusation and worse morale.'),
                    opt('amnesty', 'Declare an amnesty and a raise', '400 credits; the grudge is forgiven.'),
                ],
                fallback: 'repair', steward: 'amnesty',
            };
        },
        resolve: (s, ctx, o, c) => {
            if (o === 'amnesty' && payOr(s, ctx, { CREDITS: 400 }, () => {}, 'the amnesty')) { clearScar(s, 'sullen_crews'); moraleFx(s, 6, 3); log(s, 'An amnesty and a raise. The crews put the cutters down.', 'good'); return; }
            if (o === 'search') {
                if (hasTrait(s, 'veteran') || ctx.rng.check(0.5)) { clearScar(s, 'sullen_crews'); moraleFx(s, -4, 2); log(s, 'The saboteur was found. The crews went quiet.', 'neutral'); }
                else { moraleFx(s, -10, 3); log(s, 'The wrong man was accused. The crews are angrier than before.', 'bad'); }
                if (c.cell !== undefined) knockOut(s, c.cell, 1);
                return;
            }
            if (c.cell !== undefined) { if (ctx.charge({ METALS: 200 })) knockOut(s, c.cell, 1); else knockOut(s, c.cell, 3); }
            log(s, 'The couplings were replaced. Nobody was asked anything.', 'neutral');
        },
    },
    {
        // Starved or stormed cell blocks try the doors.
        kind: 'breakout',
        weight: (s, ctx) => (hasScar(s, 'bad_blood') && ctx.prisoners > 0 ? 3 : 0),
        open: s => {
            const warden = withTrait(s, 'veteran') ?? roster(s)[0];
            return {
                title: 'Breakout',
                text: `The cell blocks have been planning since the last time. A door is off its track and ${warden?.name ?? 'a warden'} is in the corridor with them.`,
                options: [
                    opt('hold', warden ? `${warden.name} holds the corridor` : 'Hold the corridor', 'A warden may be hurt; a few get out.'),
                    opt('open', 'Open the outer doors', 'A tenth escape into the dust; nobody is hurt.'),
                    opt('gas', 'Gas the block', '200 credits; a twentieth die, and their homeland hears of it.'),
                ],
                fallback: 'hold', steward: 'open',
            };
        },
        resolve: (s, ctx, o) => {
            if (o === 'gas' && payOr(s, ctx, { CREDITS: 200 }, () => {}, 'the gas')) { const n = ctx.losePrisoners(0.05, 'killed'); log(s, `The block was gassed. ${n} prisoners died.`, 'bad'); return; }
            if (o === 'open') { const n = ctx.losePrisoners(0.1, 'escaped'); clearScar(s, 'bad_blood'); log(s, `The outer doors were opened: ${n} ran into the dust. The rest went back to their bunks.`, 'neutral'); return; }
            const warden = withTrait(s, 'veteran') ?? pickColonist(s, ctx.rng);
            const n = ctx.losePrisoners(hasTrait(s, 'veteran') ? 0.02 : 0.05, 'escaped');
            if (warden && !hasTrait(s, 'veteran') && ctx.rng.check(0.5)) { hurtColonist(s, warden); log(s, `${warden.name} held the corridor and was hurt doing it. ${n} got out.`, 'bad'); }
            else log(s, `${warden?.name ?? 'The wardens'} held the corridor. ${n} got out.`, 'neutral');
        },
    },
    {
        // A body outside wants burying before anyone settles.
        kind: 'funeral',
        weight: s => (hasScar(s, 'unburied') ? 4 : 0),
        open: s => ({
            title: 'A grave to dig',
            text: `${s.scars?.find(x => x.kind === 'unburied')?.text ?? 'Someone lies unburied.'} The crew will not settle until it is done.`,
            options: [
                opt('service', 'Hold a service', '100 credits; morale +6 for 3 shifts.'),
                opt('quiet', 'A quiet burial', 'An hour lost; nothing else.'),
                opt('work', 'Bury them later', 'Morale −6 for 3 shifts.'),
            ],
            fallback: 'quiet', steward: 'service',
        }),
        resolve: (s, ctx, o) => {
            clearScar(s, 'unburied');
            if (o === 'service' && payOr(s, ctx, { CREDITS: 100 }, () => {}, 'a service')) { moraleFx(s, 6, 3); log(s, 'The outpost stood for the service.', 'good'); return; }
            if (o === 'work') { moraleFx(s, -6, 3); log(s, 'The grave waited. Nobody liked it.', 'bad'); return; }
            log(s, 'A quiet burial at the edge of the domes.', 'neutral');
        },
    },
    {
        // Accidents happen around some people.
        kind: 'drunk_accident',
        weight: s => (hasTrait(s, 'drunk') && s.cells.filter(c => c.module && c.module !== 'hub').length >= 2 ? 1 : 0),
        open: (s, ctx) => {
            const drunk = withTrait(s, 'drunk');
            const targets = cellsWith(s, id => id !== 'hub' && id !== 'bunker');
            if (!drunk || !targets.length) return null;
            const cell = targets[ctx.rng.nextInt(0, targets.length - 1)];
            return {
                title: `${drunk.name} again`,
                text: `${drunk.name} was found asleep in ${nameAt(s, cell)} with the hatch open and a bottle. It is not the first time.`,
                cell,
                options: [
                    opt('dock', 'Dock their pay', 'The module is knocked out a shift; morale −2.'),
                    opt('dry', 'Dry them out in the medbay', countModules(s, 'medbay') > 0 ? 'They lose the habit.' : 'No medbay: a stern talk instead.'),
                    opt('ship', 'Ship them home', 'One colonist fewer; the others breathe easier.'),
                ],
                fallback: 'dock', steward: 'dock',
            };
        },
        resolve: (s, ctx, o, c) => {
            const drunk = withTrait(s, 'drunk', false);
            if (!drunk) return;
            if (o === 'ship') { const list = roster(s); list.splice(list.indexOf(drunk), 1); s.colonists -= 1; moraleFx(s, 3, 2); log(s, `${drunk.name} was put on the next shuttle.`, 'neutral'); return; }
            if (o === 'dry' && countModules(s, 'medbay') > 0) { drunk.trait = 'engineer'; log(s, `${drunk.name} dried out in the medbay and turned out to be handy.`, 'good'); return; }
            if (c.cell !== undefined) knockOut(s, c.cell, 1);
            moraleFx(s, -2, 2);
            log(s, `${drunk.name}'s pay was docked. ${nameAt(s, c.cell)} needs a shift to sort out.`, 'neutral');
        },
    },
];

const BY_KIND = new Map(CRISES.map(c => [c.kind, c]));

/** The chance-weight of one kind right now; for probes and the balance report. */
export function crisisWeight(kind: string, state: OutpostState, ctx: CrisisContext): number {
    return BY_KIND.get(kind)?.weight(state, ctx) ?? 0;
}
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
