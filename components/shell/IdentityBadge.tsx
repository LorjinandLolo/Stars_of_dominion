"use client";

// components/shell/IdentityBadge.tsx
// Stars of Dominion — "Who am I?" badge
//
// Permanently answers the two questions every playtester eventually screams:
// WHICH ACCOUNT am I signed into, and WHICH FACTION am I playing?
// Lives in the top nav; hover for details and a proper account switch.

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUIStore } from '@/lib/store/ui-store';
import { authService } from '@/lib/auth-service';
import { factionColor } from '@/components/galaxy/starVisuals';
import { ChevronDown, LogOut, UserCircle2 } from 'lucide-react';

export default function IdentityBadge() {
    const router = useRouter();
    const playerFactionId = useUIStore(s => s.playerFactionId);
    const factions = useUIStore(s => s.factions);
    const [user, setUser] = useState<{ email: string; name: string } | null>(null);
    const [open, setOpen] = useState(false);

    useEffect(() => {
        authService.getCurrentUser().then(u => {
            if (u) setUser({ email: u.email, name: u.name });
        });
    }, []);

    const factionName = playerFactionId
        ? (factions[playerFactionId]?.name
            ?? playerFactionId.replace(/^faction-/, '').replace(/[_-]/g, ' '))
        : 'No faction';
    const color = playerFactionId ? factionColor(playerFactionId) : '#64748b';

    const handleSwitch = async () => {
        await authService.logout();
        router.push('/login');
    };

    return (
        <div
            className="relative"
            onMouseEnter={() => setOpen(true)}
            onMouseLeave={() => setOpen(false)}
        >
            <button
                className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg border bg-slate-900/80 hover:bg-slate-900 transition-all"
                style={{
                    borderColor: `${color}80`,
                    boxShadow: `0 0 10px ${color}30, inset 0 0 12px ${color}10`,
                }}
            >
                <span
                    className="w-3 h-3 rounded-full flex-shrink-0 border border-white/30"
                    style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}` }}
                />
                <span className="flex flex-col items-start leading-tight">
                    <span
                        className="text-[11px] font-display font-bold tracking-wider uppercase max-w-[150px] truncate"
                        style={{ color, textShadow: `0 0 8px ${color}60` }}
                    >
                        {factionName}
                    </span>
                    <span className="text-[8px] text-slate-400 max-w-[150px] truncate">
                        {user?.name || user?.email || 'checking identity…'}
                    </span>
                </span>
                <ChevronDown size={11} className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && (
                <div className="absolute right-0 top-full mt-1 w-60 rounded-lg border border-slate-700/80 bg-slate-950/98 backdrop-blur-xl shadow-2xl p-3 z-[80]">
                    <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
                        <UserCircle2 size={16} className="text-slate-500 flex-shrink-0" />
                        <div className="min-w-0">
                            <div className="text-[11px] font-bold text-slate-200 truncate">{user?.name || 'Unknown commander'}</div>
                            <div className="text-[9px] text-slate-500 truncate">{user?.email || 'no session found'}</div>
                        </div>
                    </div>
                    <div className="py-2 border-b border-slate-800">
                        <div className="text-[8px] uppercase tracking-widest text-slate-600 mb-1">Playing as</div>
                        <div className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                            <span className="text-[10px] font-bold text-slate-300 uppercase">{factionName}</span>
                        </div>
                    </div>
                    <button
                        onClick={handleSwitch}
                        className="mt-2 w-full flex items-center justify-center gap-1.5 py-1.5 rounded border border-slate-700 bg-slate-900 hover:bg-slate-800 text-[9px] font-bold tracking-widest text-slate-300 uppercase transition-all"
                    >
                        <LogOut size={10} />
                        Sign out / switch account
                    </button>
                </div>
            )}
        </div>
    );
}
