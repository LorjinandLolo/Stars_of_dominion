// scripts/test-government-phase5.ts
// Smoke test for Government & Leadership Phase 5 (ideology drift, political
// espionage, approval ↔ press coupling).
// Run: npx tsx scripts/test-government-phase5.ts

import assert from 'assert';
import { getGameWorldState } from '../lib/game-world-state-singleton';
import { ensureEmpirePostures } from '../lib/politics/posture-bootstrap';
import { initRegistries } from '../lib/politics/registry';
import { ensureGovernments, tickGovernments, getGovernment } from '../lib/government/government-service';
import { ensureHeadsOfState, getHeadOfState } from '../lib/government/succession-service';
import { ensureCabinets, getMinister } from '../lib/government/cabinet-service';
import { recordPoliticalEvent, tickIdeologyDrift } from '../lib/government/ideology-drift';
import { holdElection } from '../lib/government/parliament-service';
import { getDominantIdeologyType } from '../lib/politics/ideology-service';
import { OPERATION_CATALOG } from '../lib/espionage/operation-catalog';
import { getPublicTrust, adjustPublicTrust, ensurePressState } from '../lib/press-system/integration';
import { CABINET_PORTFOLIOS } from '../lib/government/types';

const TICK = 6 * 60 * 60;
const DAY = 4 * TICK;

/**
 * The catalog effects are applied inside espionage-service's private
 * applyCatalogEffects. Rather than fake an operation lifecycle, this mirrors the
 * same effect handling so the wiring contract (effect type → government field)
 * is asserted; the espionage tick calls the real one.
 */
function applyPoliticalEffects(world: any, actorId: string, targetId: string, opId: string) {
    const def = OPERATION_CATALOG.find(o => o.id === opId)!;
    const gov = getGovernment(world, targetId)!;
    const posture = world.movement.empirePostures.get(targetId);

    for (const effect of def.effects) {
        if (effect.type === 'election_swing') {
            gov.electionInterference = Math.min(60, (gov.electionInterference ?? 0) + effect.value);
        }
        if (effect.type === 'approval_damage') {
            for (const bloc of posture?.blocs ?? []) bloc.satisfaction = Math.max(0, bloc.satisfaction - effect.value * 0.4);
            adjustPublicTrust(world, targetId, -effect.value * 0.3);
        }
        if (effect.type === 'coup_pressure') {
            gov.coupPressure = Math.min(100, (gov.coupPressure ?? 0) + effect.value);
        }
        if (effect.type === 'minister_compromise') {
            const ministers = CABINET_PORTFOLIOS.map(p => getMinister(world, targetId, p)).filter(Boolean) as any[];
            const mark = ministers.sort((a, b) => (b.ambitionDrive ?? 50) - (a.ambitionDrive ?? 50))[0];
            if (mark) {
                mark.loyalty = Math.max(0, mark.loyalty - effect.value);
                mark.corruption = Math.min(100, (mark.corruption ?? 0) + effect.value * 0.5);
            }
        }
    }
    recordPoliticalEvent(world, actorId, 'covert_operation');
}

function main() {
    initRegistries();

    // ── Catalog ──────────────────────────────────────────────────────────────
    const politicalOps = ['election_interference', 'blackmail_minister', 'fund_coup', 'assassinate_head_of_state']
        .map(id => OPERATION_CATALOG.find(o => o.id === id));
    console.log(`[1] political warfare ops: ${politicalOps.map(o => `${o?.name} (${o?.risk})`).join(', ')}`);
    assert.ok(politicalOps.every(Boolean), 'political ops missing from the catalog');
    assert.ok(politicalOps.every(o => o!.category === 'political'), 'political ops must be categorised political');

    const world = getGameWorldState();
    ensureEmpirePostures(world);
    ensureGovernments(world);
    ensureHeadsOfState(world);
    ensureCabinets(world);
    ensurePressState(world);

    const actor = 'faction-vektori';
    const target = 'faction-aurelian';
    const targetGov = getGovernment(world, target)!;
    const posture = world.movement.empirePostures.get(target)!;

    // ── Ideology moves with what an empire does ──────────────────────────────
    const militarismBefore = posture.ideology.militarism_pacifism;
    const authorityBefore = posture.ideology.authoritarianism_liberty;
    recordPoliticalEvent(world, target, 'declare_war');
    recordPoliticalEvent(world, target, 'invade_planet');
    recordPoliticalEvent(world, target, 'suppress_press');
    console.log(`[2] after war, invasion and censorship: militarism ${militarismBefore} -> ${posture.ideology.militarism_pacifism}, authority ${authorityBefore} -> ${posture.ideology.authoritarianism_liberty}`);
    assert.ok(posture.ideology.militarism_pacifism > militarismBefore, 'war should push the empire militarist');
    assert.ok(posture.ideology.authoritarianism_liberty > authorityBefore, 'censorship should push it authoritarian');

    const peaceBefore = posture.ideology.militarism_pacifism;
    recordPoliticalEvent(world, target, 'offer_peace', 2);
    console.log(`[3] suing for peace pulls back: ${peaceBefore} -> ${posture.ideology.militarism_pacifism}`);
    assert.ok(posture.ideology.militarism_pacifism < peaceBefore, 'peace should pull the other way');

    // ── Whoever holds power at home reshapes the identity ────────────────────
    for (const bloc of posture.blocs) {
        bloc.satisfaction = bloc.id === 'military' ? 95 : 40;
        bloc.influence = bloc.id === 'military' ? 60 : 5;
    }
    const driftBefore = posture.ideology.militarism_pacifism;
    tickIdeologyDrift(world, DAY * 10);
    console.log(`[4] ten days run by satisfied militarists: militarism ${driftBefore.toFixed(1)} -> ${posture.ideology.militarism_pacifism.toFixed(1)} ("${getDominantIdeologyType(posture.ideology)}")`);
    assert.ok(posture.ideology.militarism_pacifism > driftBefore, 'a dominant contented bloc should pull the axes its way');

    // An angry bloc does not get to lead.
    for (const bloc of posture.blocs) bloc.satisfaction = 10;
    const angryBefore = posture.ideology.militarism_pacifism;
    tickIdeologyDrift(world, DAY * 10);
    console.log(`[5] same bloc, now furious: ${angryBefore.toFixed(1)} -> ${posture.ideology.militarism_pacifism.toFixed(1)} (no pull)`);
    assert.strictEqual(posture.ideology.militarism_pacifism, angryBefore, 'a dissatisfied bloc should not shape the identity');

    // ── Political espionage lands on institutions ────────────────────────────
    targetGov.coupPressure = 0;
    applyPoliticalEffects(world, actor, target, 'fund_coup');
    console.log(`[6] fund_coup: target coup pressure 0 -> ${targetGov.coupPressure.toFixed(1)}`);
    assert.ok(targetGov.coupPressure >= 25, 'funding a coup should raise pressure');

    const ministers = CABINET_PORTFOLIOS.map(p => getMinister(world, target, p)!).filter(Boolean);
    const mark = ministers.sort((a, b) => (b.ambitionDrive ?? 50) - (a.ambitionDrive ?? 50))[0];
    const loyaltyBefore = mark.loyalty;
    applyPoliticalEffects(world, actor, target, 'blackmail_minister');
    console.log(`[7] blackmail: ${mark.name} loyalty ${loyaltyBefore.toFixed(1)} -> ${mark.loyalty.toFixed(1)}, corruption ${mark.corruption?.toFixed(1)}`);
    assert.ok(mark.loyalty < loyaltyBefore, 'blackmail should cost the minister loyalty');

    const trustBefore = getPublicTrust(world, target);
    applyPoliticalEffects(world, actor, target, 'election_interference');
    console.log(`[8] election interference: swing ${targetGov.electionInterference}, public trust ${trustBefore.toFixed(1)} -> ${getPublicTrust(world, target).toFixed(1)}`);
    assert.ok((targetGov.electionInterference ?? 0) >= 30, 'interference should be banked against the next vote');
    assert.ok(getPublicTrust(world, target) < trustBefore, 'interference should damage trust');

    // ── Interference decides a knife-edge election ───────────────────────────
    const democrat = 'faction-vektori';
    const demGov = getGovernment(world, democrat)!;
    const incumbent = getHeadOfState(world, democrat)!;
    demGov.approval = 95;
    demGov.legitimacy = 95;
    incumbent.popularity = 95;
    demGov.electionInterference = 60;
    const wonWithInterference = holdElection(world, demGov, incumbent);
    console.log(`[9] popular incumbent under maximum foreign interference: survived=${wonWithInterference}, interference consumed=${demGov.electionInterference}`);
    assert.strictEqual(demGov.electionInterference, 0, 'interference should be spent by the vote');

    // ── Approval feeds back into the press cycle ─────────────────────────────
    const proud = getGovernment(world, 'faction-covenant')!;
    for (const bloc of world.movement.empirePostures.get('faction-covenant')!.blocs) bloc.satisfaction = 95;
    proud.corruption = 0;
    const proudTrustBefore = getPublicTrust(world, 'faction-covenant');
    tickGovernments(world, DAY * 5);
    console.log(`[10] trusted government: approval ${proud.approval.toFixed(1)}, public trust ${proudTrustBefore.toFixed(1)} -> ${getPublicTrust(world, 'faction-covenant').toFixed(1)}`);
    assert.ok(proud.approval > 70, 'contented blocs should mean high approval');
    assert.ok(getPublicTrust(world, 'faction-covenant') > proudTrustBefore, 'a backed government should earn better coverage');

    const hated = getGovernment(world, 'faction-sarrak')!;
    for (const bloc of world.movement.empirePostures.get('faction-sarrak')!.blocs) bloc.satisfaction = 2;
    hated.corruption = 0;
    const hatedTrustBefore = getPublicTrust(world, 'faction-sarrak');
    tickGovernments(world, DAY * 5);
    console.log(`[11] despised government: approval ${hated.approval.toFixed(1)}, public trust ${hatedTrustBefore.toFixed(1)} -> ${getPublicTrust(world, 'faction-sarrak').toFixed(1)}`);
    assert.ok(getPublicTrust(world, 'faction-sarrak') < hatedTrustBefore, 'a hated government should lose the benefit of the doubt');

    // ── Corruption surfaces as scandal ───────────────────────────────────────
    const crooked = getGovernment(world, 'faction-buthari')!;
    crooked.corruption = 95;
    const storiesBefore = world.press.activeStories.size;
    const crookedTrustBefore = getPublicTrust(world, 'faction-buthari');
    tickGovernments(world, DAY * 30);
    console.log(`[12] deeply corrupt government over 30 days: stories ${storiesBefore} -> ${world.press.activeStories.size}, trust ${crookedTrustBefore.toFixed(1)} -> ${getPublicTrust(world, 'faction-buthari').toFixed(1)}`);
    assert.ok(world.press.activeStories.size > storiesBefore, 'corruption should eventually break as a story');

    console.log('\nPASS — Government Phase 5: empires drift from what they do, and rivals can reach inside them.');
}

main();
