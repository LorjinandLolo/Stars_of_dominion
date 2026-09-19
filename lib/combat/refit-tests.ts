// lib/combat/refit-tests.ts
// npx tsx lib/combat/refit-tests.ts
//
// Refit: the quote (pricing through summarizeDesign), the fleet's books
// (roster, what is free to refit, applying a refit, splitting), the in-service
// lock on patterns, and a refit job landing through RecruitmentService.tick.
// The MIL_REFIT_FLEET handler itself lives in scripts/game-loop.ts and is
// verified live; everything it calls is covered here.

import { DEFAULT_DESIGNS, quoteRefit, sameFit, summarizeDesign, resolveDesign, getComponent, getHull, REFIT_HULL_TIME_FRACTION } from './ship-registry';
import { rosterByHull, refittable, applyRefit, splitRoster, reconcileBooks, mergeBooks, isBookKey } from './fleet-roster';
import { saveDesign, deleteDesign, shipsInService } from './ship-design-service';
import { RecruitmentService } from './recruitment-service';
import { drainNotifications } from '../time/notification-hooks';
import type { ShipDesign } from './ship-types';

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail?: string) {
    if (ok) { passed++; console.log(`  PASS  ${name}`); }
    else { failed++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
}
const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps;

const F = 'f1';
const std = (hull: string) => DEFAULT_DESIGNS.find(d => d.hullId === hull)!;
const design = (id: string, hullId: string, components: Record<string, string>, name = id): ShipDesign =>
    ({ id, factionId: F, name, hullId: hullId as any, components, createdAt: 1, updatedAt: 1 });
const ALL_TECH = new Set(['mil_t1_5', 'mil_t1_8', 'mil_t2_pre_2', 'mil_t2_pre_4', 'mil_t2_adp_3', 'inf_t2_ind_4', 'mil_t3_4', 'eco_t3_1']);

const railPicket = design('d-rail', 'corvette', { ...std('corvette').components, w1: 'wpn-gauss-railgun' }, 'Rail Picket');
const burner = design('d-burn', 'corvette', { ...std('corvette').components, u1: 'util-afterburners' }, 'Burner');
const lanceLine = design('d-lance', 'battleship', { w1: 'wpn-spinal-lance', w2: 'wpn-spinal-lance', w3: 'wpn-spinal-lance', w4: 'wpn-spinal-lance', c1: 'core-singularity' }, 'Lance Line');
const own = [railPicket, burner, lanceLine];
const lookup = (id: string) => resolveDesign(id, F, own);
const costOf = (ids: string[]) => ids.reduce((acc, id) => { const c = getComponent(id)!; return { CREDITS: acc.CREDITS + c.cost.credits, METALS: acc.METALS + c.cost.metals, seconds: acc.seconds + c.buildTime }; }, { CREDITS: 0, METALS: 0, seconds: 0 });

console.log('\n1. The quote');
{
    const q = quoteRefit(std('corvette'), railPicket, ALL_TECH);
    const rail = costOf(['wpn-gauss-railgun']);
    check('a one-module swap is priced at the module that goes in', q.ok && q.perShipCost.CREDITS === rail.CREDITS && q.perShipCost.METALS === rail.METALS, JSON.stringify(q.perShipCost));
    check('the module that comes off is listed and refunds nothing', q.addedModuleIds.join() === 'wpn-gauss-railgun' && q.removedModuleIds.join() === 'wpn-pulse-laser');
    check('time is a tenth of the hull plus the module', q.perShipSeconds === Math.round(REFIT_HULL_TIME_FRACTION * getHull('corvette')!.baseBuildTime) + rail.seconds, String(q.perShipSeconds));
    // (On a corvette a railgun rates 12.4 against the laser's 11.8: both round to 12.)
    check('the rating change is the two summaries apart', q.powerDelta === summarizeDesign(railPicket, null).power - summarizeDesign(std('corvette'), null).power, String(q.powerDelta));

    const bare = quoteRefit(null, std('corvette'), ALL_TECH);
    const all = costOf(Object.values(std('corvette').components));
    check('an unregistered hull is a bare hull: it pays for every module', bare.ok && bare.perShipCost.CREDITS === all.CREDITS && bare.perShipCost.METALS === all.METALS && bare.from.power === getHull('corvette')!.basePower, JSON.stringify(bare.perShipCost));

    const big = quoteRefit(std('battleship'), lanceLine, ALL_TECH);
    // 90 × (1 + 4 × 0.28 − 0.05) = 186.3; the utilities come off, so nothing else adds.
    check('standard battleship to four lances and a singularity core', big.ok && big.from.power === 142 && big.to.power === 186 && big.powerDelta === 44, `${big.from.power} -> ${big.to.power}`);
    check('that refit costs less than a new lance battleship', big.perShipCost.METALS < summarizeDesign(lanceLine, null).cost.METALS && big.perShipCost.CREDITS > 0);

    const back = quoteRefit(railPicket, std('corvette'), ALL_TECH);
    check('A -> B -> A pays both ways', back.ok && back.perShipCost.CREDITS === costOf(['wpn-pulse-laser']).CREDITS && back.perShipCost.CREDITS > 0);

    const permuted = design('d-perm', 'battleship', { w4: 'wpn-spinal-lance', w3: 'wpn-spinal-lance', w2: 'wpn-spinal-lance', w1: 'wpn-spinal-lance', c1: 'core-singularity' });
    check('the same modules in other slots are the same fit', !quoteRefit(lanceLine, permuted, ALL_TECH).ok && sameFit(lanceLine, permuted));
    const stripped = design('d-strip', 'corvette', { c1: 'core-fission' }, 'Stripped');
    const strip = quoteRefit(std('corvette'), stripped, ALL_TECH);
    check('a strip-only refit is free and lowers the rating', strip.ok && strip.perShipCost.CREDITS === 0 && strip.perShipCost.METALS === 0 && strip.powerDelta < 0);

    check('cross-hull is refused', !quoteRefit(std('cruiser'), railPicket, ALL_TECH).ok && /keeps the hull/.test(quoteRefit(std('cruiser'), railPicket, ALL_TECH).reason ?? ''));
    check('a tech-locked target is refused', !quoteRefit(std('corvette'), railPicket, new Set()).ok);
    check('the source side is never tech-checked', quoteRefit(railPicket, std('corvette'), new Set()).ok);
    const glass = design('d-glass', 'battleship', { w1: 'wpn-spinal-lance', w2: 'wpn-spinal-lance', w3: 'wpn-spinal-lance', w4: 'wpn-spinal-lance', c1: 'core-fission' }, 'Glass');
    check('a target past the brownout cap is refused', !quoteRefit(std('battleship'), glass, ALL_TECH).ok);
    const hot = design('d-hot', 'battleship', { w1: 'wpn-spinal-lance', w2: 'wpn-spinal-lance', w3: 'wpn-spinal-lance', w4: 'wpn-spinal-lance', c1: 'core-fusion' }, 'Hot');
    const hq = quoteRefit(std('battleship'), hot, ALL_TECH);
    check('a browned-out target is allowed and quoted at its net power', hq.ok && hq.to.power === 183 && hq.to.brownoutPenalty > 0, `${hq.to.power}`);
}

console.log('\n2. The books');
{
    const fleet = { id: 'fl', composition: { corvette: 6, battleship: 2, bomber: 9 }, designCounts: { 'default-corvette': 3, 'd-rail': 1, 'default-battleship': 2, 'gone-design': 4 }, basePower: 400 };
    const r = rosterByHull(fleet, lookup);
    check('ships are grouped under their hull', r.hulls.corvette.total === 6 && r.hulls.corvette.known === 4 && r.hulls.battleship.known === 2);
    check('what no pattern accounts for is unregistered', r.hulls.corvette.unregistered === 2 && r.hulls.battleship.unregistered === 0);
    check('a retired pattern still in the counts is an orphan', r.orphanIds.join() === 'gone-design');
    check('wings are not hulls', r.hulls.bomber === undefined);
    check('over-claimed books are flagged', rosterByHull({ composition: { corvette: 2 }, designCounts: { 'default-corvette': 5 } }, lookup).hulls.corvette.inconsistent);

    check('free to refit: what the books hold', refittable(fleet, 'default-corvette', 'corvette', lookup).available === 3);
    check('unregistered hulls are free to refit too', refittable(fleet, null, 'corvette', lookup).available === 2);
    const jobs = [{ kind: 'refit', targetFormationId: 'fl', count: 2, classKey: 'corvette', refitFrom: { designId: 'default-corvette' } }];
    const held = refittable(fleet, 'default-corvette', 'corvette', lookup, jobs);
    check('less what an open refit has already taken', held.available === 1 && held.reserved === 2);
    check('another fleet\'s job reserves nothing here', refittable(fleet, 'default-corvette', 'corvette', lookup, [{ ...jobs[0], targetFormationId: 'other' }]).available === 3);
    check('a recruit job reserves nothing', refittable(fleet, 'default-corvette', 'corvette', lookup, [{ ...jobs[0], kind: undefined }]).available === 3);
    const overClaim: any = { id: 'x', composition: { corvette: 2 }, designCounts: { 'default-corvette': 5 } };
    check('over-claimed books offer nothing until reconciled', refittable(overClaim, 'default-corvette', 'corvette', lookup).available === 0);
    reconcileBooks(overClaim, lookup);
    check('never more than the hulls that exist', refittable(overClaim, 'default-corvette', 'corvette', lookup).available === 2);
}

console.log('\n3. A refit rewrites four fields, and only those');
{
    const s = summarizeDesign(std('corvette'), null);
    const t = summarizeDesign(burner, null);
    const fleet: any = {
        id: 'fl', composition: { corvette: 4 }, designCounts: { 'default-corvette': 4 }, basePower: 10 + 4 * s.power,
        designProfile: { ...s.profile, energy: s.profile.energy * 4, shield: s.profile.shield * 4 }, designSpeedBonus: 0,
        strength: 0.7, experience: 0.1, leaderId: 'adm',
    };
    const before = JSON.parse(JSON.stringify(fleet));
    const delta = { fromDesignId: 'default-corvette', toDesignId: 'd-burn', from: { power: s.power, profile: s.profile, speedMult: s.speedMult }, to: { power: t.power, profile: t.profile, speedMult: t.speedMult } };
    applyRefit(fleet, delta, 2);
    check('rating moves by the per-ship delta', fleet.basePower === before.basePower + 2 * (t.power - s.power), `${before.basePower} -> ${fleet.basePower}`);
    check('counts move from one pattern to the other', fleet.designCounts['default-corvette'] === 2 && fleet.designCounts['d-burn'] === 2);
    check('the signature follows the modules', near(fleet.designProfile.shield, before.designProfile.shield - 2 * s.profile.shield + 2 * t.profile.shield) && near(fleet.designProfile.evasion, 2 * t.profile.evasion));
    check('lane speed is the new ship-weighted average', near(fleet.designSpeedBonus, 2 * 0.20 / 4), String(fleet.designSpeedBonus));
    check('hulls, crews and command are untouched', fleet.composition.corvette === 4 && fleet.strength === 0.7 && fleet.experience === 0.1 && fleet.leaderId === 'adm');
    applyRefit(fleet, { ...delta, fromDesignId: 'd-burn', toDesignId: 'default-corvette', from: delta.to, to: delta.from }, 2);
    check('X -> Y -> X restores the fleet exactly', fleet.basePower === before.basePower && near(fleet.designSpeedBonus, 0) && JSON.stringify(fleet.designCounts) === JSON.stringify(before.designCounts) && near(fleet.designProfile.shield, before.designProfile.shield) && near(fleet.designProfile.evasion, 0));
    const last: any = { id: 'l', composition: { corvette: 1 }, designCounts: { 'default-corvette': 1 }, basePower: 22 };
    applyRefit(last, delta, 1);
    check('a pattern with no ships left drops out of the counts', !('default-corvette' in last.designCounts) && last.designCounts['d-burn'] === 1);

    // The shell bug the panel flagged: unregistered ships are rated from the hull, never from basePower / ships.
    const bare = quoteRefit(null, std('corvette'), ALL_TECH);
    const legacy: any = { id: 'lg', composition: { corvette: 5 }, basePower: 100 + 5 * 10 };
    applyRefit(legacy, { fromDesignId: null, toDesignId: 'default-corvette', from: bare.from, to: bare.to }, 5);
    check('a 100-power shell with five legacy corvettes GAINS from a refit to standard', legacy.basePower === 150 + 5 * (bare.to.power - bare.from.power) && bare.to.power > bare.from.power, String(legacy.basePower));
}

console.log('\n4. A split follows the books');
{
    const c = summarizeDesign(std('corvette'), null);
    const b = summarizeDesign(std('battleship'), null);
    const src: any = {
        id: 's', composition: { corvette: 10, battleship: 2 }, designCounts: { 'default-corvette': 10, 'default-battleship': 2 },
        basePower: 10 * c.power + 2 * b.power,
        designProfile: Object.fromEntries(Object.keys(c.profile).map(k => [k, (c.profile as any)[k] * 10 + (b.profile as any)[k] * 2])),
    };
    const split = splitRoster(src, { battleship: 2 }, lookup);
    check('two battleships leave with their own rating, not a sixth of the fleet', split.movedPower === 2 * b.power, `${split.movedPower} of ${src.basePower}`);
    check('and their own pattern', JSON.stringify(split.movedCounts) === JSON.stringify({ 'default-battleship': 2 }) && JSON.stringify(split.keptCounts) === JSON.stringify({ 'default-corvette': 10 }));
    check('and their own signature', near(split.movedProfile!.energy, b.profile.energy * 2) && near(split.keptProfile!.energy, c.profile.energy * 10));

    const mixed: any = { id: 'm', composition: { corvette: 6 }, designCounts: { 'default-corvette': 3, 'd-rail': 1 }, basePower: 100 };
    const half = splitRoster(mixed, { corvette: 3 }, lookup);
    const movedKnown = Object.values(half.movedCounts).reduce((a, n) => a + n, 0);
    const keptKnown = Object.values(half.keptCounts).reduce((a, n) => a + n, 0);
    check('counts are shared by largest remainder, unregistered hulls taking their share', movedKnown + keptKnown === 4 && movedKnown <= 3 && (half.movedCounts['default-corvette'] ?? 0) >= 1, JSON.stringify(half));
    check('no pattern ever claims more ships than were moved or kept', movedKnown <= 3 && keptKnown <= 3);

    const noBooks = splitRoster({ id: 'n', composition: { corvette: 4 }, basePower: 80 }, { corvette: 1 }, lookup);
    check('a fleet with no design books splits power by hull weight', noBooks.movedPower === 20 && Object.keys(noBooks.movedCounts).length === 0 && noBooks.movedProfile === undefined);
}

console.log('\n5. A pattern in service keeps its fit');
{
    const world: any = {
        shipDesigns: new Map(), tech: new Map([[F, { unlockedTechIds: [...ALL_TECH] }]]),
        movement: { fleets: new Map([['fl', { id: 'fl', factionId: F, designCounts: { 'd-rail': 3 } }], ['other', { id: 'other', factionId: 'f2', designCounts: { 'd-rail': 9 } }]]) },
        combat: { recruitmentJobs: [{ factionId: F, designId: 'd-burn', count: 2 }, { factionId: F, kind: 'refit', designId: 'default-corvette', refitFrom: { designId: 'd-rail' }, count: 1 }] },
    };
    for (const d of [railPicket, burner]) world.shipDesigns.set(d.id, { ...d });
    check('in service = own fleets plus open build and refit jobs', shipsInService(world, F, 'd-rail') === 4 && shipsInService(world, F, 'd-burn') === 2);
    const refit = saveDesign(world, F, { ...railPicket, components: { ...railPicket.components, u1: 'util-plating' } }, 5);
    check('changing the fit of a pattern in service is refused', !refit.ok && /in service/.test((refit as any).reason), (refit as any).reason);
    const rename = saveDesign(world, F, { ...railPicket, name: 'Rail Picket Mk II' }, 5);
    check('renaming it is fine', rename.ok && world.shipDesigns.get('d-rail').name === 'Rail Picket Mk II');
    const del = deleteDesign(world, F, 'd-rail');
    check('retiring it is refused', !del.ok && /in service/.test((del as any).reason));
    world.movement.fleets.get('fl').designCounts = {};
    world.combat.recruitmentJobs = [];
    check('once the last ship is refit away both are allowed again', saveDesign(world, F, { ...railPicket, components: { ...railPicket.components, u1: 'util-plating' } }, 6).ok && deleteDesign(world, F, 'd-rail').ok);
}

console.log('\n6. A refit job lands');
{
    drainNotifications();
    const s = summarizeDesign(std('corvette'), null);
    const t = summarizeDesign(burner, null);
    const q = quoteRefit(std('corvette'), burner, ALL_TECH);
    const mkWorld = (fleet: any) => ({
        nowSeconds: 1000,
        shipDesigns: new Map(own.map(d => [d.id, d])),
        movement: { fleets: new Map(fleet ? [[fleet.id, fleet]] : []), armies: new Map() },
        economy: { factions: new Map([[F, { reserves: { CREDITS: 0, METALS: 0 } }]]) },
        construction: { planets: new Map() },
        combat: { recruitmentJobs: [] as any[] },
    });
    const mkJob = (count: number) => {
        const job = RecruitmentService.createJob('formation-fl', F, 'CORVETTE' as any, count, 1000, {
            buildTimePerUnit: q.perShipSeconds, designId: burner.id, designName: burner.name, classKey: 'corvette',
            unitPower: q.to.power, unitProfile: q.to.profile, unitSpeedMult: q.to.speedMult,
            kind: 'refit', refitFrom: { designId: 'default-corvette', designName: 'Picket Corvette', unitPower: q.from.power, unitProfile: q.from.profile, unitSpeedMult: q.from.speedMult },
            paidPerUnit: q.perShipCost,
        });
        job.targetFormationId = 'fl'; job.isFleet = true;
        return job;
    };
    const fleet: any = { id: 'fl', factionId: F, name: 'First Fleet', composition: { corvette: 4 }, designCounts: { 'default-corvette': 4 }, basePower: 10 + 4 * s.power, designSpeedBonus: 0, strength: 1 };
    const world: any = mkWorld(fleet);
    const job = mkJob(3);
    world.combat.recruitmentJobs.push(job);
    check('the job takes count × per-ship time', job.completesAt === 1000 + 3 * q.perShipSeconds);
    world.nowSeconds = job.completesAt - 1;
    RecruitmentService.tick(world);
    check('until it completes the ships keep the old fit', fleet.designCounts['default-corvette'] === 4 && world.combat.recruitmentJobs.length === 1);
    world.nowSeconds = job.completesAt;
    RecruitmentService.tick(world);
    check('on completion the ships are converted, none added', fleet.composition.corvette === 4 && fleet.designCounts['d-burn'] === 3 && fleet.designCounts['default-corvette'] === 1 && fleet.basePower === 10 + 4 * s.power + 3 * (t.power - s.power));
    check('the owner is told', drainNotifications(F).some(n => n.title === 'REFIT COMPLETE'));

    // Two of the three ships are gone by completion (lost, or split away).
    const thin: any = { id: 'fl', factionId: F, name: 'Thin', composition: { corvette: 1 }, designCounts: { 'default-corvette': 1 }, basePower: 22, strength: 1 };
    const w2: any = mkWorld(thin);
    w2.combat.recruitmentJobs.push(mkJob(3));
    w2.nowSeconds = 1e9;
    RecruitmentService.tick(w2);
    const reserves = w2.economy.factions.get(F).reserves;
    check('ships no longer aboard are refunded at what was paid', thin.designCounts['d-burn'] === 1 && reserves.CREDITS === 2 * q.perShipCost.CREDITS && reserves.METALS === 2 * q.perShipCost.METALS, JSON.stringify(reserves));

    const w3: any = mkWorld(null);
    w3.combat.recruitmentJobs.push(mkJob(2));
    w3.nowSeconds = 1e9;
    RecruitmentService.tick(w3);
    check('a fleet that is gone is refunded in full, like ships lost from one that survived', w3.combat.recruitmentJobs.length === 0 && w3.economy.factions.get(F).reserves.CREDITS === 2 * q.perShipCost.CREDITS);

    // A civil war hands the fleet to the rebels while the yard works.
    const turned: any = { id: 'fl', factionId: 'rebels', name: 'Turned', composition: { corvette: 2 }, designCounts: { 'default-corvette': 2 }, basePower: 34, strength: 1 };
    const w4: any = mkWorld(turned);
    w4.combat.recruitmentJobs.push(mkJob(2));
    w4.nowSeconds = 1e9;
    RecruitmentService.tick(w4);
    check('a refit never lands on a fleet that changed hands, and is refunded', turned.basePower === 34 && turned.designCounts['d-burn'] === undefined && w4.economy.factions.get(F).reserves.CREDITS === 2 * q.perShipCost.CREDITS);
}

console.log('\n7. Books that lie (review 2026-09-19)');
{
    const s = summarizeDesign(std('battleship'), null);

    // Two patterns each claiming all five hulls: ten refits on five ships.
    const over: any = { id: 'fl', composition: { battleship: 5 }, designCounts: { 'default-battleship': 5, 'd-lance': 5 }, basePower: 5 * s.power };
    check('over-claiming books offer nothing from any source', refittable(over, 'default-battleship', 'battleship', lookup).available === 0 && refittable(over, 'd-lance', 'battleship', lookup).available === 0 && refittable(over, null, 'battleship', lookup).available === 0);
    check('reconcile shrinks the claims to the hulls that exist', reconcileBooks(over, lookup) && over.designCounts['default-battleship'] + over.designCounts['d-lance'] === 5 && !rosterByHull(over, lookup).hulls.battleship.inconsistent, JSON.stringify(over.designCounts));
    check('after reconcile the two sources together offer five, not ten', refittable(over, 'default-battleship', 'battleship', lookup).available + refittable(over, 'd-lance', 'battleship', lookup).available === 5);
    check('reconcile never invents unregistered hulls', rosterByHull(over, lookup).hulls.battleship.unregistered === 0);
    const honest: any = { composition: { corvette: 4 }, designCounts: { 'default-corvette': 3 } };
    check('honest books are left alone', !reconcileBooks(honest, lookup) && honest.designCounts['default-corvette'] === 3);
    const legacy: any = { composition: { corvette: 2 }, designCounts: { 'default-corvette': 1, 'd-rail': 1, 'd-burn': 1, 'd-perm-gone': 1 } };
    reconcileBooks(legacy, lookup);
    check('the old rounding split (three designs on two hulls) reconciles to two, orphan untouched', rosterByHull(legacy, lookup).hulls.corvette.known === 2 && legacy.designCounts['d-perm-gone'] === 1, JSON.stringify(legacy.designCounts));

    // Ids that are Object.prototype keys.
    check('prototype keys are not book keys', !isBookKey('constructor') && !isBookKey('__proto__') && !isBookKey('toString') && !isBookKey('') && isBookKey('design-f1-1'));
    const proto: any = { id: 'fl', composition: { battleship: 4 }, designCounts: { 'default-battleship': 4 }, basePower: 4 * s.power };
    const ghost = design('constructor', 'battleship', { ...std('battleship').components }, 'Ghost');
    const ghostLookup = (id: string) => (id === 'constructor' ? ghost : lookup(id));
    const held = refittable(proto, 'constructor', 'battleship', ghostLookup);
    check('a prototype-key source holds zero ships, not NaN', held.available === 0 && Number.isFinite(held.available));
    const before = JSON.stringify(proto);
    applyRefit(proto, { fromDesignId: 'default-battleship', toDesignId: 'constructor', from: { power: s.power, speedMult: 0 }, to: { power: s.power + 50, speedMult: 0 } }, 4);
    check('a refit to a prototype-key pattern changes nothing', JSON.stringify(proto) === before);
    applyRefit(proto, { fromDesignId: 'default-battleship', toDesignId: 'd-lance', from: { power: s.power, speedMult: 0 }, to: { power: 186, speedMult: 0 } }, NaN);
    check('a NaN count changes nothing', JSON.stringify(proto) === before && Number.isFinite(proto.basePower));

    // saveDesign: the id is attacker JSON.
    const world: any = { shipDesigns: new Map<string, ShipDesign>(), movement: { fleets: new Map() }, combat: { recruitmentJobs: [] }, tech: { get: () => ({ unlockedTechIds: [...ALL_TECH] }) } };
    const draft = { name: 'Ghost', hullId: 'battleship', components: { ...std('battleship').components } };
    check('a new pattern cannot be filed as "constructor"', !saveDesign(world, F, { ...draft, id: 'constructor' } as any, 1).ok);
    check('nor as "__proto__"', !saveDesign(world, F, { ...draft, id: '__proto__' } as any, 1).ok);
    check("the designer's own id format is accepted", saveDesign(world, F, { ...draft, id: 'design-f1-1789000000000' } as any, 1).ok);
    check('no id at all mints one server-side', (() => { const r = saveDesign(world, F, { ...draft, name: 'Minted' } as any, 2); return r.ok && /^design-f1-/.test(r.design.id); })());

    // An orphan id the ships still carry cannot be re-filed as a bare hull.
    world.movement.fleets.set('fl', { id: 'fl', factionId: F, composition: { battleship: 4 }, designCounts: { 'design-f1-old': 4 }, basePower: 4 * s.power });
    const refile = saveDesign(world, F, { id: 'design-f1-old', name: 'Hulk', hullId: 'battleship', components: {} } as any, 3);
    check('an id ships still carry cannot be re-filed', !refile.ok && /already carry that pattern id/.test((refile as any).reason), JSON.stringify(refile));
    check('nothing was stored under it', !world.shipDesigns.has('design-f1-old'));

    // Tactical result / merge: the books follow the ships, then the losses leave them.
    const a: any = { id: 'a', composition: { battleship: 5 }, designCounts: { 'default-battleship': 5 }, designProfile: { ...s.profile }, basePower: 5 * s.power };
    const b: any = { id: 'b', composition: { battleship: 5 }, designCounts: { 'default-battleship': 5 }, designProfile: { ...s.profile }, basePower: 5 * s.power };
    mergeBooks(a, b);
    a.composition = { battleship: 10 }; a.basePower += b.basePower;
    check('absorbed ships keep their pattern: no unregistered hulls', a.designCounts['default-battleship'] === 10 && rosterByHull(a, lookup).hulls.battleship.unregistered === 0);
    check('so a null-source refit finds nothing to re-sell modules to', refittable(a, null, 'battleship', lookup).available === 0);
    const losses = splitRoster(a, { battleship: 7 }, lookup);
    check('seven lost: three remain on the books and power follows the rating', losses.keptCounts['default-battleship'] === 3 && a.basePower - losses.movedPower === 3 * s.power, `${JSON.stringify(losses.keptCounts)} ${a.basePower - losses.movedPower}`);
    const c: any = { designCounts: { constructor: 3, 'd-lance': 2 } as any };
    const d: any = {};
    mergeBooks(d, c);
    check('mergeBooks drops prototype-key ids', d.designCounts['d-lance'] === 2 && !Object.prototype.hasOwnProperty.call(d.designCounts, 'constructor'));
}

console.log(`\n${failed === 0 ? 'ALL PASS' : 'FAILURES'} — ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
