'use client';
// components/tutorial/TutorialLauncher.tsx
// Stars of Dominion — Tutorial Help Button (Navbar)
// Auto-starts tutorial on first login; allows restart via "?" button.

import React, { useEffect } from 'react';
import { HelpCircle } from 'lucide-react';
import { useTutorialStore } from '@/lib/tutorial/tutorial-store';

export default function TutorialLauncher() {
    const { start, restart, hasEverStarted, isActive } = useTutorialStore();

    // Auto-start on first ever launch
    useEffect(() => {
        if (!hasEverStarted) {
            // Small delay so the UI settles first
            const t = setTimeout(() => start(), 1500);
            return () => clearTimeout(t);
        }
    }, [hasEverStarted, start]);

    const handleClick = () => {
        if (isActive) return; // already running
        restart();
    };

    return (
        <button
            id="tutorial-launcher"
            onClick={handleClick}
            title={hasEverStarted ? 'Restart Tutorial' : 'Start Tutorial'}
            className={`relative flex items-center justify-center w-9 h-9 rounded-xl border transition-all duration-300 ${
                isActive
                    ? 'bg-blue-500/20 border-blue-500/40 text-blue-400'
                    : 'bg-white/5 border-white/10 hover:border-white/30 text-slate-500 hover:text-white'
            }`}
        >
            <HelpCircle className="w-4 h-4" />
        </button>
    );
}
