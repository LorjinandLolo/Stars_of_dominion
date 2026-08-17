// lib/factions/buthari.ts
// The Buthari of Jabal — never aggressors, never allies, unyielding at home.
//
// From the player design: "Cannot declare war first unless directly attacked or
// their rites are violated"; "Can't form true alliances — limited to trade or
// temporary pacts"; "When defending their homeworld or sacred territory,
// receive major combat buffs".
//
// ── What is NOT here, and why ────────────────────────────────────────────────
//
// INSURGENCY FUNDING is already live and is deliberately not reimplemented.
// civ-buthari authors espionage_power 0.35 + sabotage_efficiency 0.25, both of
// which CIV_MODIFIER_MAP routes to the SAME key, so their esp_op_success_add is
// +0.60 — the largest espionage modifier in the game. incite_rebellion's base
// success is 0.35, and the engine clamps success to 0.95, so that bonus is
// already saturating the ceiling before infiltration is even counted. A second
// Buthari success bonus would be arithmetically invisible. Anyone tempted to add
// one should read lib/civilization/modifiers.ts first.
//
// CHEMICAL IMMUNITY is dropped. Nothing in this engine can inflict a narcotic,
// plague, disease or hallucination effect on another faction — every occurrence
// of those words is flavour prose, a press-system metaphor, a system tag nobody
// writes, or the Sarrak's own self-inflicted serum. It would have been immunity
// to an empty set.

import type { GameWorldState } from '../game-world-state';
import type { ButhariTraitState, DistrictTraitMultiplier, FactionTraitState } from './faction-traits-types';
import { emptyButhariTraitState, NEUTRAL_DISTRICT_TRAITS } from './faction-traits-types';
import {
    CIV_BUTHARI, CIV_MOVANITE, CIV_LEOPANTHERI, CIV_RHIMETALS, CIV_GABAGOON,
    isButhari, isCivilization, readsGrievances,
    grievanceStore, grievanceHolders, GRIEVANCE_DURATION_SECONDS,
} from './civ-ids';
import { bumpMetric } from '../tech/history-ledger';
import { expireCouncilEffects } from './buthari-council';

export const BUTHARI_CIV_ID = CIV_BUTHARI;

const TICK_SECONDS = 6 * 60 * 60;

/** Casualties taken on sacred soil, as a multiplier. Lower is tougher. */
export const SACRED_TAKEN_MULTIPLIER = 0.75;

// Grievances are shared state now — two civilizations read them, and their
// consumers sit deeper in the engine than this module may be imported from.
// Re-exported so every existing call site and probe assertion is unchanged.
export { GRIEVANCE_DURATION_SECONDS, grievanceStore, grievanceHolders, hasGrievanceAgainst } from './civ-ids';

export const GRIEVANCE_METRIC = 'but.grievances';
export const PURITY_METRIC = 'but.purityDisputes';

/**
 * Acts of war the Buthari may not initiate.
 *
 * Kinetic and declaration verbs ONLY. Deliberately NOT the Kaer'Ruun Bloodmoon
 * list, which also forbids espionage, sanctions and pirate proxies — copying it
 * would forbid the Buthari from doing the one thing they exist to do. Subversion
 * stays open; this trait is a redirect, not a mute button.
 *
 * MIL_INVASION_PLANET and MIL_BOMBARD_PLANET matter more than DIP_DECLARE_WAR
 * here: neither calls registerActOfWar nor reads isAtWar, so without them a
 * "pacifist" faction could besiege and glass a foreign world at escalation 0.
 */
export const BUTHARI_FORBIDDEN_ACTIONS: Record<string, string> = {
    DIP_DECLARE_WAR: 'declare war',
    MIL_ATTACK_FLEET: 'open fire',
    MIL_TACTICAL_ENGAGE: 'force an engagement',
    MIL_INVASION_PLANET: 'launch an invasion',
    MIL_BOMBARD_PLANET: 'bombard a world',
    AIR_LAUNCH_SORTIE: 'fly a sortie',
};

export interface GateResult {
    allowed: boolean;
    reason?: string;
}

function stateOf(world: GameWorldState, factionId: string): ButhariTraitState | undefined {
    return world.factionTraits?.get(factionId)?.buthari;
}

/** Every faction the Buthari are currently entitled to strike. */

/**
 * Record that someone has wronged the Buthari, unlocking retaliation.
 *
 * Called from the three places roles actually exist: registerActOfWar (which
 * discards aggressor/defender one line later — it writes symmetric rivalry rows
 * and RelationEvent carries no actor), and the invasion and bombardment
 * handlers, which bypass registerActOfWar entirely.
 *
 * Without the latter two a Buthari player who is invaded but never formally
 * declared upon would stay permanently unable to answer.
 *
 * A no-op for every other civilization.
 */
export function recordGrievance(
    world: GameWorldState,
    victimFactionId: string,
    aggressorFactionId: string,
    kind: 'attacked' | 'rite_violated' = 'attacked',
): void {
    // FIVE civilizations now key off grievances, for five different reasons, and
    // this guard MUST list every one of them. It is the single writer they all
    // depend on, so a civilization that reads the store but is missing here has
    // a mechanic that is fully wired and permanently inert — which is exactly
    // what happened to the Leo-pantheri and the Rhimetals until the Gabagoonian
    // vendetta probe caught it.
    //
    // Still a no-op for the other nine: recording grievances nobody reads is how
    // dead state accumulates.
    const claimant = grievanceClaimant(world, victimFactionId);
    if (!claimant) return;
    if (!aggressorFactionId || aggressorFactionId === victimFactionId) return;

    const store = grievanceStore(world, victimFactionId);
    if (!store) return;

    const existing = store[aggressorFactionId];
    store[aggressorFactionId] = { sinceSeconds: world.nowSeconds ?? 0, kind };
    if (!existing) {
        bumpMetric(world as any, victimFactionId, GRIEVANCE_METRIC, 1);
        console.log(`[${claimant}] ${aggressorFactionId} has wronged ${victimFactionId} (${kind}).`);
    }
}

/**
 * Which civilization, if any, actually reads grievances for this faction.
 *
 *   Buthari      cannot strike first WITHOUT one   (permission)
 *   Movanite     FAFO clause suspends gridlock     (permission to hurry)
 *   Leo-pantheri an unowed war costs honour        (price)
 *   Rhimetals    the hive deliberates unprovoked   (delay)
 *   Gabagoon     insult the broadcast, get a feud  (vendetta)
 *
 * Add to this list whenever a civilization starts reading grievanceHolders.
 */
function grievanceClaimant(world: GameWorldState, factionId: string): string | null {
    if (!readsGrievances(world, factionId)) return null;
    if (isButhari(world, factionId)) return 'Buthari';
    if (isCivilization(world, factionId, CIV_MOVANITE)) return 'Movanite';
    if (isCivilization(world, factionId, CIV_LEOPANTHERI)) return 'Leo-pantheri';
    if (isCivilization(world, factionId, CIV_RHIMETALS)) return 'Rhimetals';
    if (isCivilization(world, factionId, CIV_GABAGOON)) return 'Gabagoonians';
    return null;
}

/**
 * The order gate. Refuses an act of war unless the target has already earned it.
 *
 * `targetFactionId` is optional because most order payloads name a planet or a
 * fleet rather than a faction; when the caller cannot resolve a target, any live
 * grievance permits the act. That is deliberately permissive — the alternative
 * is a faction that is attacked and still cannot shoot back because the payload
 * shape did not happen to carry an owner.
 */
export function checkAggressionGate(
    world: GameWorldState,
    factionId: string,
    actionId: string,
    targetFactionId?: string,
): GateResult {
    const verb = BUTHARI_FORBIDDEN_ACTIONS[actionId];
    if (!verb) return { allowed: true };
    if (!isButhari(world, factionId)) return { allowed: true };

    const holders = grievanceHolders(world, factionId);
    if (targetFactionId) {
        if (holders.includes(targetFactionId)) return { allowed: true };
        return {
            allowed: false,
            reason: `The Buthari do not ${verb} unprovoked — ${targetFactionId} has violated no rite of Jabal.`,
        };
    }
    if (holders.length > 0) return { allowed: true };

    return {
        allowed: false,
        reason: `The Buthari do not ${verb} first. Jabal answers violation, it does not begin it.`,
    };
}

/**
 * Is this world sacred to its owner?
 *
 * Derived, not stored. There is no sacred-territory concept in the engine to
 * reuse: the 'holy_site' system tag's only reader is a map icon, 'holy_world' is
 * seeded on two non-Buthari planets and read by nothing, and the 'Holy War'
 * biosphere trait is carried by no planet. What IS real is planet.tags —
 * 'homeworld' on every faction's capital, and 'fortified' on The High Altar.
 *
 * Deriving it means a lost world stops being sacred, which is both correct and
 * what makes rite-violation grievances possible.
 */
export function isSacredWorld(planet: any, factionId: string): boolean {
    if (!planet || planet.ownerId !== factionId) return false;
    const tags: string[] = planet.tags ?? [];
    return tags.includes('homeworld') || tags.includes('fortified');
}

/**
 * Unyielding Defence: they bleed less on their own sacred ground.
 *
 * `taken`, not `dealt` — district losses scale with the enemy's strength, so
 * raising your own output does nothing for your own casualties. The district
 * layer has no clamp, so the value is bounded here by construction.
 */
export function districtTraitsForButhari(
    world: GameWorldState,
    factionId: string,
    _terrain: string,
    planet?: any,
): DistrictTraitMultiplier {
    if (!isButhari(world, factionId)) return NEUTRAL_DISTRICT_TRAITS;
    if (!isSacredWorld(planet, factionId)) return NEUTRAL_DISTRICT_TRAITS;
    return { dealt: 1, taken: Math.max(0.5, SACRED_TAKEN_MULTIPLIER), detonation: 0 };
}

/**
 * One strategic tick of Buthari business.
 *
 * Two jobs: expire stale grievances, and notice when a rite has been violated.
 * "Rites violated" has no event to listen to, so it is derived from state that
 * already exists — a sacred world under siege, or one that has been taken.
 */
export function tickButhari(world: GameWorldState, traits: FactionTraitState): void {
    const factionId = traits.factionId;
    if (!isButhari(world, factionId)) return;

    const st: ButhariTraitState = traits.buthari ?? (traits.buthari = emptyButhariTraitState());
    if (!st.grievances) st.grievances = {};
    const now = world.nowSeconds ?? 0;

    const delta = now - st.lastEvaluatedSeconds;
    if (st.lastEvaluatedSeconds > 0 && (delta < 0 || delta > 10 * TICK_SECONDS)) {
        st.lastEvaluatedSeconds = now;
        return;
    }
    st.lastEvaluatedSeconds = now;

    // The Five withdraw when their work is done.
    expireCouncilEffects(world, factionId);

    // Grievances lapse. Jabal remembers, but not forever.
    for (const [aggressor, g] of Object.entries(st.grievances)) {
        if (now - g.sinceSeconds >= GRIEVANCE_DURATION_SECONDS) delete st.grievances[aggressor];
    }

    // A rite is violated when sacred ground is besieged, or when a world in the
    // Buthari home system falls into someone else's hands. No new event system —
    // this reads siege and ownership state that already exists.
    const homeSystemId = (world.economy?.factions?.get(factionId) as { capitalSystemId?: string } | undefined)
        ?.capitalSystemId;

    for (const planet of world.construction?.planets?.values() ?? []) {
        const p: any = planet;
        const tags: string[] = p.tags ?? [];

        if (p.ownerId === factionId) {
            // Sacred ground under siege.
            if ((tags.includes('homeworld') || tags.includes('fortified')) && p.siege?.attackerEmpireId) {
                recordGrievance(world, factionId, p.siege.attackerEmpireId, 'rite_violated');
            }
            continue;
        }

        // Someone else holds a world in OUR home system. Another faction's
        // capital falling is not a Buthari concern; ours is.
        if (homeSystemId && p.systemId === homeSystemId && p.ownerId) {
            recordGrievance(world, factionId, p.ownerId, 'rite_violated');
        }
    }
}

/** Lifetime purity disputes, incremented by the identity-politics half. */
export function recordPurityDispute(world: GameWorldState, factionId: string): void {
    if (!isButhari(world, factionId)) return;
    const traits = world.factionTraits?.get(factionId);
    if (!traits) return;
    const st = traits.buthari ?? (traits.buthari = emptyButhariTraitState());
    st.purityDisputes += 1;
    bumpMetric(world as any, factionId, PURITY_METRIC, 1);
}
