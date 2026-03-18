// lib/politics/ideology-service.ts

import type { IdeologyProfile, IdeologyAxis } from './ideology-types';

/**
 * Instantiates a fresh IdeologyProfile by evaluating an empire's defining tags.
 * Starts all axes at 0, then applies hardcoded weights based on narrative tags.
 */
export function calculateInitialIdeology(societyTags: string[], governmentTags: string[]): IdeologyProfile {
    const profile: IdeologyProfile = {
        order_chaos: 0,
        centralization_autonomy: 0,
        militarism_pacifism: 0,
        tradition_progress: 0,
        collectivism_individualism: 0,
        expansionism_isolationism: 0,
        authoritarianism_liberty: 0
    };

    const allTags = new Set([...societyTags, ...governmentTags]);

    // Militarism axis
    if (allTags.has('militarist')) profile.militarism_pacifism += 40;
    if (allTags.has('pacifist')) profile.militarism_pacifism -= 40;
    if (allTags.has('expansionist')) profile.militarism_pacifism += 20;

    // Order/Chaos axis
    if (allTags.has('authoritarian')) profile.order_chaos += 30;
    if (allTags.has('honor_culture')) profile.order_chaos += 20;

    // Centralization axis
    if (allTags.has('centralized_rule')) profile.centralization_autonomy += 50;
    if (allTags.has('senate_system')) profile.centralization_autonomy -= 30;

    // Tradition/Progress axis
    if (allTags.has('technocratic')) profile.tradition_progress -= 40; // Progress is negative
    if (allTags.has('scientific_culture')) profile.tradition_progress -= 30;
    if (allTags.has('religious')) profile.tradition_progress += 40;
    if (allTags.has('traditional')) profile.tradition_progress += 30;

    // Collectivism/Individualism axis
    if (allTags.has('corporate')) profile.collectivism_individualism -= 40; // Individualism is negative
    if (allTags.has('merchant_culture')) profile.collectivism_individualism -= 30;
    if (allTags.has('collectivist')) profile.collectivism_individualism += 40;

    // Expansionism axis
    if (allTags.has('expansionist')) profile.expansionism_isolationism += 50;
    if (allTags.has('isolationist')) profile.expansionism_isolationism -= 50;

    // Authoritarianism/Liberty axis
    if (allTags.has('autocracy')) profile.authoritarianism_liberty += 50;
    if (allTags.has('democracy')) profile.authoritarianism_liberty -= 50;

    // Final clamp to bounds
    for (const key of Object.keys(profile) as IdeologyAxis[]) {
        profile[key] = clampAxis(profile[key]);
    }

    return profile;
}

/**
 * Standard clamping function restricting an ideological axis strictly between -100 and +100.
 */
export function clampAxis(val: number): number {
    return Math.max(-100, Math.min(100, val));
}

/**
 * Applies a specific numerical shift to a given ideological axis.
 * Calling parameters (like +5 militarism) are automatically clamped.
 */
export function applyIdeologyShift(profile: IdeologyProfile, axis: IdeologyAxis, delta: number): void {
    if (!profile || !axis) return;
    profile[axis] = clampAxis(profile[axis] + delta);
}

/**
 * Derives a human-readable categorical label for the faction's active state
 * based entirely on magnitude checkpoints. 
 * (e.g. "Militarist Authoritarian State" or "Corporate Oligarchy")
 */
export function getDominantIdeologyType(profile: IdeologyProfile): string {
    const keywords: string[] = [];

    // Axis 1: Militarism
    if (profile.militarism_pacifism > 50) keywords.push("Militarist");
    else if (profile.militarism_pacifism < -50) keywords.push("Pacifist");

    // Axis 2: Progress
    if (profile.tradition_progress < -50) keywords.push("Technocratic");
    else if (profile.tradition_progress > 50) keywords.push("Traditional");

    // Axis 3: Individualism / Collectivism
    if (profile.collectivism_individualism < -40 && profile.authoritarianism_liberty > 20) keywords.push("Corporate");
    else if (profile.collectivism_individualism > 50) keywords.push("Collectivist");

    // Axis 4: Expansion
    if (profile.expansionism_isolationism > 50) keywords.push("Expansionist");
    else if (profile.expansionism_isolationism < -50) keywords.push("Isolationist");

    // Form structure (Noun trailing)
    let noun = "State";
    if (profile.authoritarianism_liberty > 60) noun = "Autocracy";
    else if (profile.authoritarianism_liberty < -60) noun = "Democracy";
    else if (profile.centralization_autonomy < -40) noun = "Federation";
    else if (profile.authoritarianism_liberty > 20 && profile.collectivism_individualism < -20) noun = "Oligarchy";

    if (keywords.length === 0) return `Neutral ${noun}`;

    // Grab top 2 leading adjectives so the string doesn't get unreadably long
    return `${keywords.slice(0, 2).join(' ')} ${noun}`;
}

/**
 * Calculates the total sum distance between two IdeologyProfiles across all 7 axes.
 * Maximum possible distance = 1400.
 * A high distance dictates significant diplomatic penalties, distrust, and friction.
 */
export function ideologyDistance(a: IdeologyProfile, b: IdeologyProfile): number {
    let distance = 0;
    const axes: IdeologyAxis[] = [
        'order_chaos',
        'centralization_autonomy',
        'militarism_pacifism',
        'tradition_progress',
        'collectivism_individualism',
        'expansionism_isolationism',
        'authoritarianism_liberty'
    ];

    for (const axis of axes) {
        distance += Math.abs(a[axis] - b[axis]);
    }

    return distance;
}

