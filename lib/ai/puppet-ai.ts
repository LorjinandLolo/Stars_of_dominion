// lib/ai/puppet-ai.ts
// Stars of Dominion — what a puppet state does for its patron.
//
// A court that fell to a sitting ruler's plot (lib/government/foreign-
// ministers.ts installPuppet) stays AI-run under the persona. Every strategic
// tick it joins its patron's wars through the player's own DIP_DECLARE_WAR
// (the AI order outbox, so every gate applies), never fights the patron, and
// pays tribute: a slice of its credit reserve moves to the patron's. The
// patron's own empire is untouched; this is the Separatists building the
// Empire's army.

import type { GameWorldState } from '@/lib/game-world-state';
import { ensurePuppets } from '@/lib/government/foreign-ministers';
import { warEnemiesOf, isAIRunFaction } from './belt-ambush-ai';
import { aiDeclareWar } from './war-ai';
import { isAtWar } from '@/lib/diplomacy/offer-service';
import { POLITICAL_CAPITAL_COSTS } from '@/lib/actions/political-costs';

/** Share of the puppet's credit reserve paid to the patron each strategic tick. */
export const TRIBUTE_SHARE_PER_TICK = 0.01;

export interface PuppetTurn { puppetFactionId: string; joinedWarsOn: string[]; tribute: number }

export function tickPuppets(world: GameWorldState): PuppetTurn[] {
    const out: PuppetTurn[] = [];
    for (const [puppetId, rec] of ensurePuppets(world)) {
        const patronId = rec.patronFactionId;
        if (!world.economy.factions.has(puppetId) || !world.economy.factions.has(patronId)) continue;
        const turn: PuppetTurn = { puppetFactionId: puppetId, joinedWarsOn: [], tribute: 0 };

        // The patron's wars are the puppet's wars. Only an AI-run puppet
        // can be ordered; a puppet a player later claims makes its own calls.
        if (isAIRunFaction(world as any, puppetId)) {
            const price = POLITICAL_CAPITAL_COSTS.DIP_DECLARE_WAR ?? 0;
            let pc = Number((world as any).government?.get?.(puppetId)?.politicalCapital ?? 0);
            for (const enemy of warEnemiesOf(world as any, patronId)) {
                if (enemy === puppetId || isAtWar(world, puppetId, enemy)) continue;
                // The declaration pays the player's price; a court that
                // cannot pay waits, as any AI court does.
                if (pc < price) break;
                if (aiDeclareWar(world, puppetId, enemy, 'grievance')) { turn.joinedWarsOn.push(enemy); pc -= price; }
            }
        }

        // Tribute.
        const puppet: any = world.economy.factions.get(puppetId);
        const patron: any = world.economy.factions.get(patronId);
        const credits = Number(puppet?.reserves?.CREDITS ?? 0);
        const paid = Math.floor(credits * TRIBUTE_SHARE_PER_TICK);
        if (paid > 0 && patron?.reserves) {
            puppet.reserves.CREDITS = credits - paid;
            patron.reserves.CREDITS = Number(patron.reserves.CREDITS ?? 0) + paid;
            turn.tribute = paid;
        }
        out.push(turn);
    }
    return out;
}
