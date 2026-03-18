import { Crisis, CrisisType } from '../../types/index';
import { PlayerTechState, TechEffect, PrimaryEffectType, Magnitude } from './types';
import { registry } from './engine';

export class CrisisTechIntegration {

    /**
     * Applies Tech-based modifiers to a Crisis object *before* it is presented to the player.
     * This allows for "Mean" effects like inserting fake options or hiding information.
     */
    static applyCrisisModifiers(crisis: Crisis, attackerState?: PlayerTechState, defenderState?: PlayerTechState): Crisis {
        // Clone crisis to avoid mutation
        const modifiedCrisis: Crisis = JSON.parse(JSON.stringify(crisis));

        // 1. Apply Defender's Defensive Techs
        if (defenderState) {
            defenderState.activeEffects.forEach(effect => {
                if (effect.type === PrimaryEffectType.CRISIS_MODIFIER) {
                    this.applyEffectToCrisis(modifiedCrisis, effect, 'defender');
                }
            });
        }

        // 2. Apply Attacker's Offensive Techs (if Attacker is the initiator)
        if (attackerState && crisis.initiator_faction_id === attackerState.factionId) {
            attackerState.activeEffects.forEach(effect => {
                if (effect.type === PrimaryEffectType.CRISIS_MODIFIER) {
                    this.applyEffectToCrisis(modifiedCrisis, effect, 'attacker');
                }
            });
        }

        return modifiedCrisis;
    }

    private static applyEffectToCrisis(crisis: Crisis, effect: TechEffect, source: 'attacker' | 'defender') {
        // Handle specific modifier payloads
        if (!effect.modifier) return;

        const mod = effect.modifier;

        switch (mod.action) {
            case 'insertFakeOption':
                // Adds a trap option to the Crisis choices (if choices existed in the Crisis object)
                // Note: The base Crisis interface in types/index.ts doesn't explicitly have 'choices' yet
                // (it has consequences/resolution_cost). 
                // However, the prompt mentions "Crisis Menu Modifiers". 
                // We'll simulate adding a "fake option" by modifying the description or adding a 'customOptions' field 
                // if we could, but let's assume we modify the 'consequences' or title to mislead.

                // If the game uses a separate 'CrisisOption' type (not in index.ts), we'd modify that.
                // For now, we'll append to the description to indicate the UI should show a fake option.
                // In a real implementation, this would modify the `choices` array passed to the UI.

                crisis.description += `\n[SYSTEM HACK]: Optional protocol '${mod.label}' available.`;
                // We can't strictly add a choice to `Crisis` interface without changing types/index.ts.
                // But we can add a property if we cast or if we extended the type.
                // For this exercise, we'll assume we are adhering to strict types/index.ts 
                // so we mainly modify what IS there.
                break;

            case 'removeOption':
                // Logic to remove an option would go here.
                break;

            case 'statShift':
                // e.g. reduce resolution cost
                if (source === 'defender' && effect.magnitude === Magnitude.HIGH) {
                    crisis.resolution_cost = crisis.resolution_cost.map(c => ({
                        ...c,
                        amount: Math.floor(c.amount * 0.8) // 20% discount
                    }));
                }
                break;
        }
    }
}
