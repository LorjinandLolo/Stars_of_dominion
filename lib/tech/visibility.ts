import { PlayerTechState, PublicSignal, VisibilityModifierType, Tech, Domain, Tier } from './types';
import { registry } from './engine';

export class VisibilityEngine {

    /**
     * Calculates what a Viewer sees of a Target's tech state
     */
    static getVisibleSignals(viewerId: string, targetState: PlayerTechState): PublicSignal[] {
        const signals: PublicSignal[] = [];

        targetState.unlockedTechIds.forEach(techId => {
            const tech = registry.get(techId);
            if (!tech) return;

            // Base Signal
            let signal: PublicSignal = {
                playerId: targetState.factionId,
                domain: tech.tree || Domain.MILITARY,
                tier: tech.tier || Tier.FOUNDATION,
                timestamp: Date.now(), // In real app, store unlock time in state
                isObscured: false,
                isFalsified: false
            };

            // Apply Visibility Modifiers
            const vMod = (tech as any).visibilityModifier;
            if (vMod) {
                switch (vMod) {
                    case VisibilityModifierType.OBSCURE_TIER:
                        signal.isObscured = true;
                        // Tier remains in object for logic, but UI should hide it
                        break;

                    case VisibilityModifierType.FALSIFY_DOMAIN:
                        signal.isFalsified = true;
                        signal.domain = this.getFalsifiedDomain(tech.tree || Domain.MILITARY);
                        break;

                    case VisibilityModifierType.DELAYED_REVEAL:
                        // For simulation, we might filter it out entirely if "now" < revealTime
                        // But simplification: just mark allowed
                        break;
                }
            }

            signals.push(signal);
        });

        return signals;
    }

    private static getFalsifiedDomain(trueDomain: Domain): Domain {
        // Deterministic cycle for falsification
        switch (trueDomain) {
            case Domain.MILITARY: return Domain.ECONOMY;
            case Domain.ECONOMY: return Domain.DIPLOMACY;
            case Domain.DIPLOMACY: return Domain.INFRASTRUCTURE;
            case Domain.INFRASTRUCTURE: return Domain.ESPIONAGE;
            case Domain.ESPIONAGE: return Domain.MILITARY;
            default: return Domain.MILITARY;
        }
    }
}
