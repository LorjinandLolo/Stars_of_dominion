"use client";

import React, { useState, useEffect } from 'react';
import { useUIStore } from '@/lib/store/ui-store';
import { useRouter } from 'next/navigation';
import { authService } from '@/lib/auth-service';

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

    const [takenFactions, setTakenFactions] = useState<Record<string, { userId: string, displayName: string }>>({});
    const [currentUser, setCurrentUser] = useState<any>(null);

    useEffect(() => {
        // Fetch User
        authService.getCurrentUser().then(user => {
             if (user) {
                  setCurrentUser(user);
             } else {
                  router.push('/login');
             }
        });

        // Fetch Taken Factions
        fetch('/api/lobby/claim')
            .then(res => res.json())
            .then(data => {
                if (data.claimedFactions) {
                    setTakenFactions(data.claimedFactions);
                     // If I already claimed something, pre-select it
                     const myClaim = Object.entries(data.claimedFactions).find(([fid, data]: [string, any]) => data.userId === currentUser?.$id);
                     if (myClaim) {
                          setSelectedId(myClaim[0]);
                          setPlayerFactionId(myClaim[0]);
                     }
                }
            })
            .catch(err => console.error("Failed to fetch claims:", err));
    }, [currentUser?.$id]);

    const handleSelect = (factionId: string) => {
        // If we already have a lock in the DB, we can't change it here
        const myClaim = Object.entries(takenFactions).find(([fid, data]: [string, any]) => data.userId === currentUser?.$id);
        if (myClaim) return; 

        if (takenFactions[factionId] && takenFactions[factionId].userId !== currentUser?.$id) return; // Locked by someone else
        setSelectedId(factionId);
    };

    const handleConfirm = async () => {
        if (!selectedId || !currentUser) return;
        setConfirming(true);
        
        try {
            const res = await fetch('/api/lobby/claim', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: currentUser.$id,
                    factionId: selectedId,
                    displayName: currentUser.name
                })
            });

            if (!res.ok) {
                 const err = await res.json();
                 alert(`Cannot claim faction: ${err.error}`);
                 setConfirming(false);
                 return;
            }

            // Success
            localStorage.setItem('selectedFactionId', selectedId);
            setPlayerFactionId(selectedId);
            router.push('/');
        } catch (e) {
            alert('Failed to contact server.');
            setConfirming(false);
        }
    };

    const selected = factions.find(f => f.id === selectedId);
    const hovered = factions.find(f => f.id === hoveredId);
    const currentUserHasClaim = currentUser && Object.values(takenFactions).some((d: any) => d.userId === currentUser?.$id);

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
                <div className="absolute top-0 right-0 mt-[-20px] mr-[-40px]">
                    <button 
                        onClick={async () => {
                            await authService.logout();
                            router.push('/login');
                        }}
                        className="text-slate-500 hover:text-white text-xs uppercase tracking-widest px-4 py-2 border border-slate-800 hover:border-slate-600 rounded-full transition-all"
                    >
                        Sign Out
                    </button>
                </div>
                <div className="text-slate-500 text-xs tracking-[0.4em] uppercase mb-3">Stars of Dominion</div>
                <h1 className="text-5xl font-bold text-white mb-3" style={{ letterSpacing: '-0.02em' }}>
                    {currentUserHasClaim ? 'Faction Locked' : 'Choose Your Faction'}
                </h1>
                <p className="text-slate-400 text-lg">
                    {currentUserHasClaim 
                        ? `You have committed to leading the ${selected?.name}.` 
                        : 'Select the empire you will lead to galactic supremacy.'}
                </p>
                <div className="text-slate-600 text-[10px] mt-4 uppercase tracking-[0.2em]">Total Factions: {factions.length} | Available: {factions.length - Object.keys(takenFactions).length}</div>
            </div>

            {/* Faction Cards - Scrollable area */}
            <div className="relative z-10 max-w-5xl w-full px-6 mb-10 overflow-y-auto max-h-[65vh] custom-scrollbar pr-2">
                <div className="grid grid-cols-2 gap-5">
                {factions
                    .map(faction => {
                        const isSelected = selectedId === faction.id;
                        const isHovered = hoveredId === faction.id;
                        const claimData = takenFactions[faction.id];
                        const isOwnedByMe = claimData && claimData.userId === currentUser?.$id;
                        const isOwnedByOthers = claimData && claimData.userId !== currentUser?.$id;
                        const isLocked = currentUserHasClaim && isOwnedByMe;

                        return (
                            <button
                                key={faction.id}
                                disabled={(currentUserHasClaim && !isOwnedByMe) || isOwnedByOthers}
                                onClick={() => handleSelect(faction.id)}
                                onMouseEnter={() => setHoveredId(faction.id)}
                                onMouseLeave={() => setHoveredId(null)}
                                className={`text-left rounded-xl p-6 border transition-all duration-300 relative overflow-hidden group ${(currentUserHasClaim && !isOwnedByMe) || isOwnedByOthers ? 'opacity-40 grayscale cursor-not-allowed' : ''}`}
                                style={{
                                    background: isOwnedByMe
                                        ? `linear-gradient(135deg, ${faction.color}90, ${faction.color}40)`
                                        : isSelected
                                            ? `linear-gradient(135deg, ${faction.color}90, ${faction.color}40)`
                                            : isHovered
                                                ? `linear-gradient(135deg, ${faction.color}40, ${faction.color}10)`
                                                : 'rgba(15, 20, 35, 0.8)',
                                    borderColor: isOwnedByMe || isSelected
                                        ? faction.accentColor
                                        : isHovered
                                            ? `${faction.accentColor}60`
                                            : 'rgba(100,116,139,0.2)',
                                    boxShadow: isSelected || isOwnedByMe
                                        ? `0 0 30px ${faction.accentColor}40, inset 0 0 30px ${faction.color}20`
                                        : isHovered
                                            ? `0 0 15px ${faction.accentColor}20`
                                            : 'none',
                                    transform: isSelected || isOwnedByMe ? 'scale(1.02)' : isHovered ? 'scale(1.01)' : 'scale(1)',
                                }}
                            >
                                    {/* Selection indicator */}
                                    {(isSelected || isOwnedByMe) && (
                                        <div
                                            className="absolute top-4 right-4 w-6 h-6 rounded-full flex items-center justify-center text-sm z-20"
                                            style={{ background: faction.accentColor }}
                                        >
                                            {isOwnedByMe ? '🔒' : '✓'}
                                        </div>
                                    )}

                                    {/* Ownership Label */}
                                    {isOwnedByOthers && (
                                        <div className="absolute top-4 right-4 px-3 py-1 bg-red-500/20 border border-red-500/40 rounded-full text-[10px] font-bold text-red-400 z-20 uppercase tracking-widest">
                                            Claimed by {claimData.displayName}
                                        </div>
                                    )}

                                    {/* Icon + Name */}
                                    <div className="flex items-center gap-4 mb-3 relative z-10">
                                        <div className="w-16 h-16 rounded-lg overflow-hidden border border-white/10 flex-shrink-0 bg-black/40">
                                            <img 
                                                src={faction.icon} 
                                                alt={faction.name} 
                                                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                                            />
                                        </div>
                                        <div>
                                            <div className="text-white font-bold text-xl leading-tight">{faction.name}</div>
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
            </div>

            {/* Confirm Button */}
            <div className="relative z-10 text-center">
                <button
                    onClick={handleConfirm}
                    disabled={(!selectedId || confirming) && !currentUserHasClaim}
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
                    {confirming 
                        ? '⏳ Entering game...' 
                        : currentUserHasClaim 
                            ? '🚀 Re-enter Game' 
                            : selectedId 
                                ? `🚀 Play as ${selected!.name}` 
                                : 'Select a faction first'}
                </button>
                {currentUserHasClaim && !confirming && (
                    <p className="text-slate-500 text-sm mt-3">
                        Your choice is locked. Contact an admin if you need to reset your claim.
                    </p>
                )}
            </div>
        </div>
    );
}
