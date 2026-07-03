"use client";

import React, { useMemo } from 'react';
import { useUIStore } from '@/lib/store/ui-store';
import { UnitCard } from './UnitCard';
import { GroundUnitType, PlanetaryDefenseState, InvadingForceState } from '@/lib/combat/siege/siege-types';
import { Shield, Swords, Anchor, X, Users } from 'lucide-react';
import { executePlayerAction } from '@/app/actions/registry-handler';

const BATTALION_SIZES: Record<GroundUnitType, number> = {
    INFANTRY: 800,
    ARMOR: 40,
    ARTILLERY: 20,
    ANTI_ARMOR: 40,
    AIRBORNE: 800,
    SPECIAL_OPS: 100,
    MILITIA: 800,
};

const UNIT_ICONS: Record<string, string> = {
    INFANTRY: '🪖',
    ARMOR: '🛡️',
    ARTILLERY: '💥',
    ANTI_ARMOR: '🚀',
    AIRBORNE: '🪂',
    SPECIAL_OPS: '🥷',
    MILITIA: '👨‍🌾',
    CORVETTE: '🛸',
    DESTROYER: '🚀',
    CRUISER: '🛰️',
    BATTLESHIP: '🛸',
    STATION: '🛰️',
    DEFENSE_PLATFORM: '🛡️'
};

interface RenderableUnit {
    id: string;
    type: GroundUnitType;
    currentHealth: number;
    maxHealth: number;
    ammo: number;
    experience: number;
}

function chunkUnits(
    composition: Record<GroundUnitType, number>, 
    supplyPercent: number, 
    moralePercent: number,
    prefix: string
): RenderableUnit[] {
    const units: RenderableUnit[] = [];
    
    Object.entries(composition).forEach(([type, count]) => {
        const uType = type as GroundUnitType;
        const size = BATTALION_SIZES[uType] || 800;
        const numCards = Math.ceil(count / size);
        let remaining = count;

        for (let i = 0; i < numCards; i++) {
            const health = Math.min(remaining, size);
            remaining -= health;
            
            if (health > 0) {
                units.push({
                    id: `${prefix}-${uType}-${i}`,
                    type: uType,
                    currentHealth: health,
                    maxHealth: size,
                    ammo: supplyPercent,
                    experience: moralePercent,
                });
            }
        }
    });

    return units;
}

export function ReviewPanel() {
    const { 
        selectedPlanetId, 
        selectedFleetId,
        setSelectedPlanet,
        setSelectedFleetId,
        planets,
        fleets,
        armies,
        playerFactionId 
    } = useUIStore();

    const [isMinimized, setIsMinimized] = React.useState(false);
    const [selectedCardId, setSelectedCardId] = React.useState<string | null>(null);
    const [viewLayer, setViewLayer] = React.useState<'ground' | 'space'>('ground');
    const [panelMode, setPanelMode] = React.useState<'manage' | 'recruit'>('manage');

    // 1. Identify what we are looking at (Planet Garrison/Siege, or Fleet)
    const selectedPlanet = useMemo(() => planets.find(p => p.id === selectedPlanetId), [planets, selectedPlanetId]);
    const selectedFleet = useMemo(() => fleets.find(f => f.id === selectedFleetId), [fleets, selectedFleetId]);

    const localArmies = useMemo(() => selectedPlanet ? armies.filter(a => a.currentPlanetId === selectedPlanet.id && a.factionId === playerFactionId) : [], [armies, selectedPlanet, playerFactionId]);
    const localFleets = useMemo(() => selectedPlanet ? fleets.filter(f => f.currentSystemId === selectedPlanet.systemId && f.factionId === playerFactionId) : [], [fleets, selectedPlanet, playerFactionId]);
    const embarkedArmies = useMemo(() => selectedFleet ? armies.filter(a => a.transportFleetId === selectedFleet.id && a.factionId === playerFactionId) : [], [armies, selectedFleet, playerFactionId]);

    const activeData = useMemo(() => {
        if (selectedPlanet) {
            if (viewLayer === 'ground') {
                if (selectedPlanet.siege) {
                    const s = selectedPlanet.siege;
                    const isAttacker = s.attackerEmpireId === playerFactionId;
                    const isDefender = s.defenderEmpireId === playerFactionId;
                    
                    if (isAttacker) return { type: 'invasion', state: s.attackerState, name: "Invasion Force" };
                    if (isDefender) return { type: 'defense', state: s.defenderState, name: "Planetary Defense" };
                    return { type: 'spectator', state: s.defenderState, name: "Planetary Defense (Spectating)" };
                }
                const gState = selectedPlanet.garrison || {
                    garrisonTroops: 0, unitComposition: {}, supply: 0, maxSupply: 100, morale: 0, maxMorale: 100, cohesion: 0, maxCohesion: 100,
                } as PlanetaryDefenseState;
                
                return { type: 'garrison', state: gState, name: `${selectedPlanet.name} Garrison` };
            } else {
                // Space View
                const defendingFleets = fleets.filter(f => f.currentSystemId === selectedPlanet.systemId && f.factionId === selectedPlanet.ownerId);
                return { type: 'orbital', state: defendingFleets, name: `${selectedPlanet.name} Orbital Space` };
            }
        } else if (selectedFleet) {
            return { type: 'fleet', state: selectedFleet, name: `${selectedFleet.name}` };
        }
        return null;
    }, [selectedPlanet, selectedFleet, playerFactionId, viewLayer, fleets]);

    if (!activeData || !activeData.state) return null;

    // Build the renderable unit cards
    let units: RenderableUnit[] = [];
    
    if (activeData.type === 'orbital') {
        const defendingFleets = activeData.state as any[];
        defendingFleets.forEach((fleet) => {
            Object.entries(fleet.composition || {}).forEach(([type, count]) => {
                const actualCount = count as number;
                for(let i=0; i<actualCount; i++) {
                    units.push({
                        id: `ship-${fleet.id}-${type}-${i}`,
                        type: (type === 'ARMOR' ? 'CORVETTE' : type) as any, // Map legacy script data
                        currentHealth: 100, maxHealth: 100,
                        ammo: 100, experience: 100
                    });
                }
            });
        });
    } else if (activeData.type === 'fleet') {
        const fleet = activeData.state as any;
        Object.entries(fleet.composition || {}).forEach(([type, count]) => {
            const actualCount = count as number;
            for(let i=0; i<actualCount; i++) {
                units.push({
                    id: `ship-${fleet.id}-${type}-${i}`,
                    type: (type === 'ARMOR' ? 'CORVETTE' : type) as any,
                    currentHealth: 100, maxHealth: 100,
                    ammo: 100, experience: 100
                });
            }
        });
    } else {
        // Ground version
        const state = activeData.state as PlanetaryDefenseState | InvadingForceState;
        const supplyPct = state.maxSupply > 0 ? (state.supply / state.maxSupply) * 100 : 0;
        const moralePct = state.maxMorale > 0 ? (state.morale / state.maxMorale) * 100 : 0;
        
        units = chunkUnits(state.unitComposition || {}, supplyPct, moralePct, activeData.type);
    }

    const isSpaceTheme = activeData.type === 'fleet' || activeData.type === 'orbital';
    const isOwner = selectedPlanet?.ownerId === playerFactionId || selectedFleet?.factionId === playerFactionId;

    const handleRecruit = async (unitType: string) => {
        if (isSpaceTheme) {
            let targetFleetId = selectedFleetId;
            if (!targetFleetId && selectedPlanet) {
                // Find first allied fleet in this system/planet orbit
                const alliedFleet = fleets.find(f => f.currentSystemId === selectedPlanet.systemId && f.factionId === playerFactionId);
                if (alliedFleet) {
                    targetFleetId = alliedFleet.id;
                } else {
                    alert("No allied fleet in orbit. Commissioning new fleet...");
                    await executePlayerAction('MIL_BUILD_FLEET', {
                        planetId: selectedPlanet.id,
                        systemId: selectedPlanet.systemId
                    }, playerFactionId || '');
                    return;
                }
            }
            if (!targetFleetId || !playerFactionId) return;
            try {
                await executePlayerAction('MIL_RECRUIT_FORMATION_UNIT', {
                    formationId: targetFleetId,
                    isFleet: true,
                    unitType,
                    count: 1
                }, playerFactionId);
            } catch (err) {
                console.error("Fleet recruitment failed:", err);
            }
        } else {
            if (!selectedPlanet || !playerFactionId) return;
            try {
                await executePlayerAction({
                    id: `act_rec_${Date.now()}`,
                    actionId: 'PLANET_RECRUIT_UNITS',
                    issuerId: playerFactionId,
                    targetId: selectedPlanet.id,
                    payload: { planetId: selectedPlanet.id, unitType, count: 10 },
                    timestamp: Math.floor(Date.now() / 1000)
                });
            } catch (err) {
                console.error("Recruitment failed:", err);
            }
        }
    };

    return (
        <div 
            className={`fixed bottom-0 left-1/2 -translate-x-1/2 z-40 transition-all duration-300 ${isMinimized ? 'translate-y-[calc(100%-2rem)]' : 'translate-y-0'}`}
            onWheel={(e) => e.stopPropagation()}
        >
            <div className={`${isSpaceTheme ? 'bg-indigo-950/95 border-indigo-700/60' : 'bg-slate-950/95 border-slate-700/60'} backdrop-blur-md border-t border-l border-r rounded-t-xl shadow-[0_-8px_32px_rgba(0,0,0,0.5)] flex flex-col items-center transition-colors duration-500`}>
                
                {/* Drag Handle / Minimize Toggle */}
                <div 
                    className={`w-full h-8 flex justify-center items-center cursor-pointer ${isSpaceTheme ? 'hover:bg-indigo-900/50 border-indigo-800/80' : 'hover:bg-slate-800/50 border-slate-800'} rounded-t-xl border-b relative transition-colors duration-500`}
                    onClick={() => setIsMinimized(!isMinimized)}
                >
                    <div className={`w-16 h-1 ${isSpaceTheme ? 'bg-indigo-500/50' : 'bg-slate-600'} rounded-full`} />
                    
                    {/* Title */}
                    <span className={`absolute left-4 text-[10px] font-display tracking-widest uppercase flex items-center gap-2 ${isSpaceTheme ? 'text-indigo-300' : 'text-slate-400'}`}>
                        {activeData.type === 'fleet' || activeData.type === 'orbital' ? <Anchor size={12} /> : activeData.type === 'invasion' ? <Swords size={12} /> : <Shield size={12} />}
                        {activeData.name} ({units.length} Units)
                    </span>

                    {/* Mode Toggles */}
                    <div className="absolute right-12 flex gap-3 items-center" onClick={(e) => e.stopPropagation()}>
                        
                        {/* Manage / Recruit Toggle */}
                        {isOwner && (isSpaceTheme ? (!!selectedFleetId || !!selectedPlanet) : viewLayer === 'ground') && (
                            <div className="flex gap-1 bg-slate-900 rounded p-0.5 border border-slate-700/50">
                                <button 
                                    onClick={() => setPanelMode('manage')}
                                    className={`px-2 py-0.5 text-[9px] font-bold uppercase rounded transition-colors ${panelMode === 'manage' ? 'bg-slate-700 text-white' : 'text-slate-500 hover:bg-slate-800'}`}
                                >
                                    Manage
                                </button>
                                <button 
                                    onClick={() => setPanelMode('recruit')}
                                    className={`px-2 py-0.5 text-[9px] font-bold uppercase rounded transition-colors ${panelMode === 'recruit' ? 'bg-amber-600/40 text-amber-400' : 'text-slate-500 hover:bg-slate-800'}`}
                                >
                                    Recruit
                                </button>
                            </div>
                        )}

                        {/* Ground / Space Toggle (Only when a planet is selected) */}
                        {selectedPlanet && (
                            <div className="flex gap-1 bg-slate-900 rounded p-0.5">
                                <button 
                                    onClick={() => { setViewLayer('ground'); setPanelMode('manage'); }}
                                    className={`px-2 py-0.5 text-[9px] font-bold uppercase rounded transition-colors ${viewLayer === 'ground' ? 'bg-emerald-600/40 text-emerald-400' : 'text-slate-500 hover:bg-slate-800'}`}
                                >
                                    Ground
                                </button>
                                <button 
                                    onClick={() => { setViewLayer('space'); setPanelMode('manage'); }}
                                    className={`px-2 py-0.5 text-[9px] font-bold uppercase rounded transition-colors ${viewLayer === 'space' ? 'bg-indigo-600/40 text-indigo-400' : 'text-slate-500 hover:bg-slate-800'}`}
                                >
                                    Space
                                </button>
                            </div>
                        )}
                    </div>

                    <button className="absolute right-4 text-slate-500 hover:text-slate-300" onClick={(e) => { e.stopPropagation(); setSelectedPlanet(null); setSelectedFleetId(null); }}>
                        <X size={14} />
                    </button>
                </div>

                {/* Unit Tray or Recruitment View */}
                {panelMode === 'manage' ? (
                    <div className="w-[80vw] max-w-5xl overflow-x-auto p-4 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-slate-600 flex gap-3 items-center min-h-[160px]">
                        {isOwner && (isSpaceTheme ? (!!selectedFleetId || !!selectedPlanet) : viewLayer === 'ground') && (
                            <button
                                onClick={() => setPanelMode('recruit')}
                                className="w-24 h-36 flex-shrink-0 rounded-md border border-dashed border-slate-700 bg-slate-900/60 hover:bg-slate-800 hover:border-amber-500/50 flex flex-col items-center justify-center gap-2 text-slate-400 hover:text-amber-400 transition-all"
                            >
                                <span className="text-3xl font-light">+</span>
                                <span className="text-[10px] font-display uppercase tracking-widest">Recruit</span>
                            </button>
                        )}

                        {/* Stationed Armies (Embarkable) */}
                        {!isSpaceTheme && selectedPlanet && localArmies.map(army => (
                            <div 
                                key={army.id}
                                className="w-40 h-36 flex-shrink-0 rounded-md border border-slate-700 bg-slate-950/90 flex flex-col p-3 justify-between relative overflow-hidden"
                            >
                                <div>
                                    <div className="text-[10px] font-bold text-amber-400 uppercase truncate">{army.name}</div>
                                    <div className="text-[8px] text-slate-500 font-mono mt-0.5">POWER: {army.basePower}</div>
                                    <div className="text-[8px] text-slate-400 mt-2 truncate font-mono">
                                        {Object.entries(army.composition || {}).map(([type, count]) => `${count} ${type.substring(0, 3)}`).join(', ') || 'No units'}
                                    </div>
                                </div>

                                <div className="space-y-1.5 z-10">
                                    {localFleets.length > 0 ? (
                                        <select 
                                            className="w-full bg-slate-900 border border-slate-800 p-1 rounded text-[9px] text-slate-300 font-mono"
                                            onChange={async (e) => {
                                                if (e.target.value) {
                                                    await executePlayerAction('MIL_EMBARK_ARMY', { 
                                                        armyId: army.id, 
                                                        fleetId: e.target.value 
                                                    }, playerFactionId || '');
                                                }
                                            }}
                                            defaultValue=""
                                        >
                                            <option value="" disabled>Board Fleet...</option>
                                            {localFleets.map(f => (
                                                <option key={f.id} value={f.id}>{f.name}</option>
                                            ))}
                                        </select>
                                    ) : (
                                        <div className="text-[8px] text-slate-500 text-center py-1 bg-slate-900 rounded border border-slate-800 font-mono uppercase">
                                            No Fleet in Orbit
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}

                        {/* Embarked Armies (Disembarkable) */}
                        {isSpaceTheme && selectedFleet && embarkedArmies.map(army => (
                            <div 
                                key={army.id}
                                className="w-40 h-36 flex-shrink-0 rounded-md border border-slate-700 bg-slate-950/90 flex flex-col p-3 justify-between relative overflow-hidden"
                            >
                                <div>
                                    <div className="text-[10px] font-bold text-cyan-400 uppercase truncate">{army.name}</div>
                                    <div className="text-[8px] text-slate-500 font-mono mt-0.5">EMBARKED</div>
                                    <div className="text-[8px] text-slate-400 mt-2 truncate font-mono">
                                        {Object.entries(army.composition || {}).map(([type, count]) => `${count} ${type.substring(0, 3)}`).join(', ') || 'No units'}
                                    </div>
                                </div>

                                <div className="space-y-1.5 z-10">
                                    {planets.filter(p => p.systemId === selectedFleet.currentSystemId).length > 0 ? (
                                        <select 
                                            className="w-full bg-slate-900 border border-slate-800 p-1 rounded text-[9px] text-slate-300 font-mono"
                                            onChange={async (e) => {
                                                if (e.target.value) {
                                                    await executePlayerAction('MIL_DISEMBARK_ARMY', { 
                                                        armyId: army.id, 
                                                        planetId: e.target.value 
                                                    }, playerFactionId || '');
                                                }
                                            }}
                                            defaultValue=""
                                        >
                                            <option value="" disabled>Disembark to...</option>
                                            {planets.filter(p => p.systemId === selectedFleet.currentSystemId).map(p => (
                                                <option key={p.id} value={p.id}>{p.name}</option>
                                            ))}
                                        </select>
                                    ) : (
                                        <div className="text-[8px] text-slate-500 text-center py-1 bg-slate-900 rounded border border-slate-800 font-mono uppercase">
                                            No Planet
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}

                        {units.length === 0 ? (
                            (!isOwner || (isSpaceTheme ? (!selectedFleetId && !selectedPlanet) : viewLayer !== 'ground')) && (
                                <div className="w-full h-full flex flex-col items-center justify-center opacity-50">
                                    {isSpaceTheme ? <Anchor size={32} className="mb-2 text-indigo-500" /> : <Shield size={32} className="mb-2 text-slate-500" />}
                                    <span className={`text-xs font-display tracking-widest uppercase ${isSpaceTheme ? 'text-indigo-400' : 'text-slate-400'}`}>
                                        {isSpaceTheme ? 'No Ships in Orbit' : 'No Units Stationed'}
                                    </span>
                                </div>
                            )
                        ) : (
                            units.map(u => (
                                <UnitCard
                                    key={u.id}
                                    type={u.type}
                                    icon={UNIT_ICONS[u.type] || '❓'}
                                    name={u.type.replace('_', ' ')}
                                    currentHealth={u.currentHealth}
                                    maxHealth={u.maxHealth}
                                    ammo={u.ammo}
                                    experience={u.experience}
                                    isSelected={selectedCardId === u.id}
                                    theme={isSpaceTheme ? 'space' : 'ground'}
                                    onClick={() => setSelectedCardId(u.id)}
                                />
                            ))
                        )}
                    </div>
                ) : (
                    <div className="w-[80vw] max-w-5xl p-6 min-h-[160px] flex flex-col items-center">
                        <h4 className="text-amber-400 font-display tracking-widest text-sm mb-4 uppercase">
                            {isSpaceTheme ? 'Commission Space Forces' : 'Commission Ground Forces'}
                        </h4>
                        <div className="flex gap-4">
                            {(isSpaceTheme 
                                ? ['CORVETTE', 'DESTROYER', 'CRUISER', 'BATTLESHIP'] 
                                : ['INFANTRY', 'ARMOR', 'ANTI_ARMOR', 'ARTILLERY', 'SPECIAL_OPS']
                            ).map(type => (
                                <button
                                    key={type}
                                    onClick={() => handleRecruit(type)}
                                    className="w-32 py-3 px-2 rounded-xl bg-slate-900 border border-slate-700 hover:border-amber-500/50 text-center group transition-all flex flex-col items-center hover:bg-slate-800"
                                >
                                    <span className="text-2xl mb-2 group-hover:scale-110 transition-transform">{UNIT_ICONS[type] || '❓'}</span>
                                    <div className="text-[10px] font-bold text-slate-300 group-hover:text-amber-300">{type.replace('_', ' ')}</div>
                                    <div className="text-[9px] text-slate-500 mt-1 flex items-center gap-1">
                                        {isSpaceTheme ? '⚓ 1 Ship' : <><Users size={10} /> +10 Bat.</>}
                                    </div>
                                    <div className="text-[8px] text-slate-600 mt-1">
                                        {isSpaceTheme ? 'Production Queue' : '30s Construction'}
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                )}
                
            </div>
        </div>
    );
}
