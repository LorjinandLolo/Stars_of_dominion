'use client';
import Link from 'next/link';
import React, { useState } from 'react';
import { LayoutDashboard, Users, BookOpen, Archive } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useUIStore } from '@/lib/store/ui-store';

// Dynamically loaded to avoid SSR issues for client-only widgets
const TickCountdown   = dynamic(() => import('@/components/notifications/TickCountdown'), { ssr: false });
const NotificationBell = dynamic(() => import('@/components/notifications/NotificationBell'), { ssr: false });
const NotificationFeed = dynamic(() => import('@/components/notifications/NotificationFeed'), { ssr: false });
const TutorialLauncher = dynamic(() => import('@/components/tutorial/TutorialLauncher'), { ssr: false });
const SaveLoadModal    = dynamic(() => import('@/components/shell/SaveLoadModal'), { ssr: false });

export default function Navbar() {
    const playerFactionId = useUIStore(s => s.playerFactionId);
    const [saveLoadOpen, setSaveLoadOpen] = useState(false);

    return (
        <>
            <nav id="navbar-root" className="flex items-center justify-between px-6 py-3 bg-slate-950/90 backdrop-blur-md border-b border-white/10 sticky top-0 z-50">
                {/* Brand */}
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center font-bold text-white text-sm shadow-lg shadow-blue-500/20">S</div>
                    <span className="font-display font-bold text-sm tracking-widest uppercase text-white">Stars of Dominion</span>
                </div>

                {/* Center: Tick Countdown */}
                <div className="flex items-center">
                    <TickCountdown />
                </div>

                {/* Right: Nav links + widgets */}
                <div className="flex items-center gap-3">
                    <Link href="/" className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-white/5">
                        <LayoutDashboard size={14} />
                        <span>Dashboard</span>
                    </Link>
                    <Link href="/faction" className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-white/5">
                        <Users size={14} />
                        <span>Factions</span>
                    </Link>

                    <div className="h-4 w-px bg-white/10" />

                    {/* Save/Load */}
                    <button
                        onClick={() => setSaveLoadOpen(true)}
                        title="Chronicle Vault — Save &amp; Load"
                        className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-white/5 border border-transparent hover:border-white/10"
                    >
                        <Archive size={14} />
                        <span>Vault</span>
                    </button>

                    {/* Tutorial */}
                    <TutorialLauncher />

                    {/* Notification Bell */}
                    <NotificationBell factionId={playerFactionId ?? undefined} />
                </div>
            </nav>

            {/* Notification feed (slide-in panel) */}
            <NotificationFeed />

            {/* Save/Load Modal */}
            <SaveLoadModal
                isOpen={saveLoadOpen}
                onClose={() => setSaveLoadOpen(false)}
                factionId={playerFactionId ?? 'default'}
            />
        </>
    );
}
