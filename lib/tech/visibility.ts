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
                domain: tech.domain || tech.branch || Domain.MILITARY,
                tier: tech.tier || Tier.I,
                timestamp: Date.now(), // In real app, store unlock time in state
                isObscured: false,
                isFalsified: false
            };

            // Apply Visibility Modifiers
            if (tech.visibilityModifier) {
                switch (tech.visibilityModifier) {
                    case VisibilityModifierType.OBSCURE_TIER:
                        signal.isObscured = true;
                        // Tier remains in object for logic, but UI should hide it
                        break;

                    case VisibilityModifierType.FALSIFY_DOMAIN:
                        signal.isFalsified = true;
                        signal.domain = this.getFalsifiedDomain(tech.domain || tech.branch || Domain.MILITARY);
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
        // Mil -> Econ -> Dip -> Cul -> Mil
        switch (trueDomain) {
            case Domain.MILITARY: return Domain.ECONOMIC;
            case Domain.ECONOMIC: return Domain.DIPLOMATIC;
            case Domain.DIPLOMATIC: return Domain.CULTURAL;
            case Domain.CULTURAL: return Domain.MILITARY;
        }
    }
}
