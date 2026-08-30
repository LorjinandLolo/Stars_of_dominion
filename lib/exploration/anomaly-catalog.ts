// lib/exploration/anomaly-catalog.ts
// Authored anomaly pool for the exploration system. The pool lives in
// world.movement.anomalyPool and is consumed by attachAnomaly in
// exploration-service.ts — each entry can trigger once per galaxy, so the
// catalog is a budget of discoveries, not a random table.

import type { Anomaly, MovementWorldState } from '../movement/types';

const CATALOG: Omit<Anomaly, 'triggered' | 'triggeredAt'>[] = [
    {
        id: 'anomaly-derelict-ark',
        name: 'Derelict Generation Ark',
        description: 'A pre-hyperlane colony ship, drifting cold. Its vaults are intact.',
        trigger: 'onSurvey',
        tagWeights: { void: 0.3, relic: 0.5 },
        payload: { effect: 'credits_cache', amount: 12000 },
    },
    {
        id: 'anomaly-shattered-gate',
        name: 'Shattered Gate Ring',
        description: 'Fragments of a gate no registry remembers building.',
        trigger: 'onSurvey',
        tagWeights: { gate: 0.6, relic: 0.4 },
        payload: { effect: 'tech_hint', domain: 'physics' },
    },
    {
        id: 'anomaly-silent-beacon',
        name: 'Silent Beacon',
        description: 'A navigation beacon still transmitting a language nobody speaks.',
        trigger: 'onSurvey',
        tagWeights: { anomalous: 0.5 },
        payload: { effect: 'tech_hint', domain: 'computing' },
    },
    {
        id: 'anomaly-glass-fields',
        name: 'Fields of Glass',
        description: 'A continent fused to glass. Something fought here, and won badly.',
        trigger: 'onSurvey',
        tagWeights: { relic: 0.4, fortress: 0.2 },
        payload: { effect: 'chronicle_flavor', tone: 'ominous' },
    },
    {
        id: 'anomaly-seed-vault',
        name: 'Orbital Seed Vault',
        description: 'A sealed agricultural vault in a decaying orbit, still viable.',
        trigger: 'onSurvey',
        tagWeights: { standard: 0.2 },
        payload: { effect: 'resource_cache', resource: 'FOOD', amount: 4000 },
    },
    {
        id: 'anomaly-hollow-moon',
        name: 'Hollow Moon',
        description: 'The moon rings like a bell. It is not solid rock.',
        trigger: 'onSurvey',
        tagWeights: { anomalous: 0.7, void: 0.2 },
        payload: { effect: 'chronicle_flavor', tone: 'mystery' },
    },
    {
        id: 'anomaly-corsair-cache',
        name: 'Corsair Dead-Drop',
        description: 'A pirate supply cache, unclaimed for decades. Finders keepers.',
        trigger: 'onSurvey',
        tagWeights: { void: 0.2 },
        payload: { effect: 'credits_cache', amount: 6000 },
    },
    {
        id: 'anomaly-relic-foundry',
        name: 'Relic Foundry',
        description: 'An automated foundry still cycling, waiting for orders that never came.',
        trigger: 'onSettlement',
        tagWeights: { relic: 0.6 },
        payload: { effect: 'resource_cache', resource: 'METALS', amount: 5000 },
    },
    {
        id: 'anomaly-deep-vein',
        name: 'Impossibly Deep Vein',
        description: 'The survey drill never found the bottom of the deposit.',
        trigger: 'onMining',
        tagWeights: { standard: 0.3 },
        payload: { effect: 'resource_cache', resource: 'METALS', amount: 8000 },
    },
    {
        id: 'anomaly-ghost-convoy',
        name: 'Ghost Convoy',
        description: 'Freighters on a route no charter records, crews long gone.',
        trigger: 'onTradeThrough',
        tagWeights: { gate: 0.3 },
        payload: { effect: 'credits_cache', amount: 9000 },
    },
    {
        id: 'anomaly-choir-static',
        name: 'The Choir in the Static',
        description: 'Every receiver in-system hears the same slow harmonic. No source.',
        trigger: 'onSurvey',
        tagWeights: { anomalous: 0.8 },
        payload: { effect: 'chronicle_flavor', tone: 'mystery' },
    },
    {
        id: 'anomaly-tomb-fleet',
        name: 'Tomb Fleet',
        description: 'Warships of an extinct power, holding formation around nothing.',
        trigger: 'onSurvey',
        tagWeights: { relic: 0.5, fortress: 0.3 },
        payload: { effect: 'tech_hint', domain: 'military' },
    },
];

/**
 * Seed the world's anomaly pool if it is empty. Idempotent — safe to call every
 * tick, and safe on deserialized snapshots that predate the catalog.
 */
export function seedAnomalyPool(movement: MovementWorldState): void {
    if (movement.anomalyPool.length > 0) return;
    for (const entry of CATALOG) {
        movement.anomalyPool.push({ ...entry, triggered: false });
    }
}
