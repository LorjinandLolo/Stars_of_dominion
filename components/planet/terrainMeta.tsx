// components/planet/terrainMeta.tsx
// Display metadata for surface terrain types: color, icon, copy.

import React from 'react';
import type { TerrainType, PlanetArchetype } from '@/lib/planet-surface/types';
import {
    Wheat, Mountain, Trees, TreePalm, Sun, Waves, Snowflake, Skull, Flame, Building2, Landmark,
} from 'lucide-react';

export interface TerrainMeta {
    label: string;
    color: string;
    icon: React.ReactNode;
    blurb: string;
}

export const TERRAIN_META: Record<TerrainType, TerrainMeta> = {
    plains:    { label: 'Plains',    color: '#84cc16', icon: <Wheat size={16} />,     blurb: 'Open fertile ground. Cheap to develop, favours agriculture and habitation — but offers attackers no obstacles.' },
    mountains: { label: 'Mountains', color: '#a8a29e', icon: <Mountain size={16} />,  blurb: 'Rich mineral veins and natural fortification. Mining thrives here, and defenders hold the high ground.' },
    forest:    { label: 'Forest',    color: '#4ade80', icon: <Trees size={16} />,     blurb: 'Dense woodland. Concealment for defenders and guerrillas; slows heavy movement.' },
    jungle:    { label: 'Jungle',    color: '#10b981', icon: <TreePalm size={16} />,  blurb: 'Thick tropical canopy. Hard to occupy, harder to supply. Ambush country.' },
    desert:    { label: 'Desert',    color: '#f59e0b', icon: <Sun size={16} />,       blurb: 'Harsh open expanse. Excellent for solar arrays; brutal for unsupplied troops.' },
    ocean:     { label: 'Ocean',     color: '#38bdf8', icon: <Waves size={16} />,     blurb: 'Open water. Restricts conventional landings — only naval and coastal installations survive here.' },
    frozen:    { label: 'Frozen',    color: '#cbd5e1', icon: <Snowflake size={16} />, blurb: 'Ice fields and permafrost. Costly habitation, natural preservation, terrible campaigning weather.' },
    toxic:     { label: 'Toxic',     color: '#a855f7', icon: <Skull size={16} />,     blurb: 'Corrosive atmosphere pockets. Requires specialised infrastructure; lethal to unprotected forces.' },
    volcanic:  { label: 'Volcanic',  color: '#f87171', icon: <Flame size={16} />,     blurb: 'Active geology. Geothermal riches and rare ores beside constant hazard.' },
    urban:     { label: 'Urban',     color: '#b3a48c', icon: <Building2 size={16} />, blurb: 'Dense settlement. The political and economic heart — and the costliest battlefield of all.' },
    ruins:     { label: 'Ancient Ruins', color: '#facc15', icon: <Landmark size={16} />, blurb: 'Remnants of a precursor civilization. Research treasure; superstition for the locals.' },
};

/** Radial-gradient stops for the central planet-core emblem. */
export const ARCHETYPE_CORE: Record<PlanetArchetype, [string, string]> = {
    continental: ['#166534', '#0c4a6e'],
    arid:        ['#b45309', '#7c2d12'],
    oceanic:     ['#0369a1', '#082f49'],
    frozen:      ['#94a3b8', '#1e293b'],
    volcanic:    ['#b91c1c', '#450a0a'],
    toxic:       ['#7e22ce', '#2e1065'],
    gaia:        ['#16a34a', '#14532d'],
    montane:     ['#78716c', '#292524'],
};

export const ARCHETYPE_LABEL: Record<PlanetArchetype, string> = {
    continental: 'Continental',
    arid: 'Arid',
    oceanic: 'Oceanic',
    frozen: 'Frozen',
    volcanic: 'Volcanic',
    toxic: 'Toxic',
    gaia: 'Gaia',
    montane: 'Montane',
};
