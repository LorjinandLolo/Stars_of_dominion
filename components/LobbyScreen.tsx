"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUIStore } from '@/lib/store/ui-store';

interface LobbyFaction {
    id: string;
    name: string;
    tagline: string;
    description: string;
    color: string;
    accentColor: string;
    icon: string;
    playstyle: string;
    traits: string[];
}

interface LobbyScreenProps {
    factions: LobbyFaction[];
}

export default function LobbyScreen({ factions }: LobbyScreenProps) {
    const router = useRouter();
    const setPlayerFactionId = useUIStore(s => s.setPlayerFactionId);
    const [hoveredId, setHoveredId] = useState<string | null>(null);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [confirming, setConfirming] = useState(false);

    const handleSelect = (factionId: string) => {
        setSelectedId(factionId);
    };

    const handleConfirm = () => {
        if (!selectedId) return;
        setConfirming(true);
        // Save to localStorage and store
        localStorage.setItem('selectedFactionId', selectedId);
        setPlayerFactionId(selectedId);
        setTimeout(() => router.push('/'), 800);
    };

    const selected = factions.find(f => f.id === selectedId);
    const hovered = factions.find(f => f.id === hoveredId);

    return (
        <div
            className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden"
            style={{
                background: 'radial-gradient(ellipse at center, #0a0f1e 0%, #020409 100%)',
                fontFamily: "'Inter', sans-serif",
            }}
        >
            {/* Starfield bg */}
            <div className="absolute inset-0 pointer-events-none" style={{
                backgroundImage: 'radial-gradient(1px 1px at 20% 30%, rgba(255,255,255,0.4) 0%, transparent 100%), radial-gradient(1px 1px at 70% 60%, rgba(255,255,255,0.2) 0%, transparent 100%), radial-gradient(1px 1px at 50% 80%, rgba(255,255,255,0.3) 0%, transparent 100%)',
            }} />

            {/* Glow behind selected faction */}
            {(selected || hovered) && (
                <div
                    className="absolute inset-0 pointer-events-none transition-all duration-700"
                    style={{
                        background: `radial-gradient(ellipse 60% 40% at 50% 60%, ${(hovered || selected)!.accentColor}15 0%, transparent 70%)`,
                    }}
                />
            )}

            {/* Header */}
            <div className="relative z-10 text-center mb-12">
                <div className="text-slate-500 text-xs tracking-[0.4em] uppercase mb-3">Stars of Dominion</div>
                <h1 className="text-5xl font-bold text-white mb-3" style={{ letterSpacing: '-0.02em' }}>
                    Choose Your Faction
                </h1>
                <p className="text-slate-400 text-lg">Select the empire you will lead to galactic supremacy.</p>
            </div>

            {/* Faction Cards */}
            <div className="relative z-10 grid grid-cols-2 gap-5 max-w-4xl w-full px-6 mb-10">
                {factions.map(faction => {
                    const isSelected = selectedId === faction.id;
                    const isHovered = hoveredId === faction.id;
                    return (
                        <button
                            key={faction.id}
                            onClick={() => handleSelect(faction.id)}
                            onMouseEnter={() => setHoveredId(faction.id)}
                            onMouseLeave={() => setHoveredId(null)}
                            className="text-left rounded-xl p-6 border transition-all duration-300 relative overflow-hidden group"
                            style={{
                                background: isSelected
                                    ? `linear-gradient(135deg, ${faction.color}90, ${faction.color}40)`
                                    : isHovered
                                        ? `linear-gradient(135deg, ${faction.color}40, ${faction.color}10)`
                                        : 'rgba(15, 20, 35, 0.8)',
                                borderColor: isSelected
                                    ? faction.accentColor
                                    : isHovered
                                        ? `${faction.accentColor}60`
                                        : 'rgba(100,116,139,0.2)',
                                boxShadow: isSelected
                                    ? `0 0 30px ${faction.accentColor}40, inset 0 0 30px ${faction.color}20`
                                    : isHovered
                                        ? `0 0 15px ${faction.accentColor}20`
                                        : 'none',
                                transform: isSelected ? 'scale(1.02)' : isHovered ? 'scale(1.01)' : 'scale(1)',
                            }}
                        >
                            {/* Selection indicator */}
                            {isSelected && (
                                <div
                                    className="absolute top-4 right-4 w-6 h-6 rounded-full flex items-center justify-center text-sm"
                                    style={{ background: faction.accentColor }}
                                >
                                    ✓
                                </div>
                            )}

                            {/* Icon + Name */}
                            <div className="flex items-center gap-3 mb-3">
                                <span className="text-3xl">{faction.icon}</span>
                                <div>
                                    <div className="text-white font-bold text-lg leading-tight">{faction.name}</div>
                                    <div
                                        className="text-xs font-medium italic mt-0.5"
                                        style={{ color: faction.accentColor }}
                                    >
                                        {faction.tagline}
                                    </div>
                                </div>
                            </div>

                            {/* Description */}
                            <p className="text-slate-400 text-sm leading-relaxed mb-4">{faction.description}</p>

                            {/* Playstyle + Traits */}
                            <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                    <span className="text-slate-500 text-xs uppercase tracking-wider">Playstyle:</span>
                                    <span
                                        className="text-xs font-semibold px-2 py-0.5 rounded"
                                        style={{ background: `${faction.accentColor}20`, color: faction.accentColor }}
                                    >
                                        {faction.playstyle}
                                    </span>
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                    {faction.traits.map(trait => (
                                        <span
                                            key={trait}
                                            className="text-xs px-2 py-0.5 rounded border"
                                            style={{
                                                borderColor: `${faction.accentColor}30`,
                                                color: 'rgba(148,163,184,0.8)'
                                            }}
                                        >
                                            {trait}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </button>
                    );
                })}
            </div>

            {/* Confirm Button */}
            <div className="relative z-10 text-center">
                <button
                    onClick={handleConfirm}
                    disabled={!selectedId || confirming}
                    className="px-12 py-4 rounded-lg font-bold text-lg transition-all duration-300 disabled:opacity-30 disabled:cursor-not-allowed"
                    style={{
                        background: selectedId
                            ? `linear-gradient(135deg, ${selected!.accentColor}, ${selected!.color})`
                            : 'rgba(100,116,139,0.2)',
                        color: selectedId ? '#fff' : 'rgba(148,163,184,0.5)',
                        boxShadow: selectedId ? `0 0 30px ${selected!.accentColor}50` : 'none',
                        transform: selectedId && !confirming ? 'scale(1.02)' : 'scale(1)',
                    }}
                >
                    {confirming ? '⏳ Entering game...' : selectedId ? `🚀 Play as ${selected!.name}` : 'Select a faction first'}
                </button>
                {selectedId && !confirming && (
                    <p className="text-slate-500 text-sm mt-3">
                        Your choice is saved locally. You can change it by returning to this page.
                    </p>
                )}
            </div>
        </div>
    );
}
