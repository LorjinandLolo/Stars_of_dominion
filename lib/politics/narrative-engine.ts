import type { GameWorldState } from '../game-world-state';
import { getDominantIdeologyType } from './ideology-service';

/**
 * Procedurally generates a narrative tone prompt based on an empire's 
 * JSON society and dynamic IdeologyProfile. Useful as an injection for LLM prompts 
 * or internal flavor text renderers.
 */
export function generateNarrativeTone(factionId: string, world: GameWorldState): string {
    const posture = world.movement.empirePostures.get(factionId);
    if (!posture || !posture.ideology) return "neutral, administrative";

    const ideology = posture.ideology;
    const dominantType = getDominantIdeologyType(ideology);
    const toneKeywords: string[] = [dominantType.toLowerCase()];

    // Aggressive combinations
    if (ideology.militarism_pacifism > 60 && ideology.authoritarianism_liberty > 40) {
        toneKeywords.push("aggressive", "expansionist", "ruthless dictation");
    } else if (ideology.militarism_pacifism > 30) {
        toneKeywords.push("disciplined", "martial", "force-oriented");
    }

    // Commercial / Liberal combinations
    if (ideology.collectivism_individualism < -40 && ideology.authoritarianism_liberty < -40) {
        toneKeywords.push("negotiation-focused", "trade-oriented", "pluralistic");
    } else if (ideology.collectivism_individualism < -30) {
        toneKeywords.push("profit-driven", "transactional", "pragmatic");
    }

    // Scientific
    if (ideology.tradition_progress < -60 && ideology.order_chaos > 20) {
        toneKeywords.push("analytical", "research-driven", "coldly rational");
    }

    // Honor / Tradition
    if (ideology.tradition_progress > 50 && ideology.authoritarianism_liberty > 30) {
        toneKeywords.push("traditional", "aristocratic", "honor-bound");
    } else if (ideology.tradition_progress > 70) {
        toneKeywords.push("zealous", "dogmatic", "devout");
    }

    // Default fallback
    if (toneKeywords.length === 1) { // 1 because dominantType is always index 0
        if (ideology.authoritarianism_liberty < -50) toneKeywords.push("diplomatic", "bureaucratic");
        else if (ideology.authoritarianism_liberty > 50) toneKeywords.push("authoritarian", "imperious");
        else toneKeywords.push("neutral", "pragmatic");
    }

    return toneKeywords.join(", ");
}
