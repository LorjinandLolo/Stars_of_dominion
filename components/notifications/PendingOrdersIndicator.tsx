"use client";

// components/notifications/PendingOrdersIndicator.tsx
// Stars of Dominion — Pending Orders HUD
//
// Small stack of chips (bottom-left) showing orders that have been dispatched
// but not yet confirmed by an authoritative snapshot. Gives players immediate
// "the game heard you" feedback while the 5s worker cycle does its thing.

import React from 'react';
import { useUIStore } from '@/lib/store/ui-store';

export default function PendingOrdersIndicator() {
    const pendingOrders = useUIStore(s => s.pendingOrders);
    const removePendingOrder = useUIStore(s => s.removePendingOrder);

    if (pendingOrders.length === 0) return null;

    return (
        <div className="fixed bottom-4 left-4 z-[70] flex flex-col gap-1.5 pointer-events-none">
            {pendingOrders.slice(-5).map(order => {
                const failed = order.status === 'failed';
                return (
                    <div
                        key={order.localId}
                        className={`pointer-events-auto flex items-center gap-2 px-3 py-1.5 rounded border text-[11px] font-mono tracking-wide shadow-lg backdrop-blur-sm transition-all ${
                            failed
                                ? 'bg-red-950/80 border-red-700/60 text-red-300'
                                : 'bg-slate-900/80 border-cyan-800/50 text-cyan-300'
                        }`}
                    >
                        {failed ? (
                            <span className="text-red-400">✕</span>
                        ) : (
                            <span className="w-2.5 h-2.5 border-2 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin flex-shrink-0" />
                        )}

                        <span className="uppercase">
                            {failed ? `Rejected: ${order.label}` : `${order.label} — syncing`}
                        </span>

                        {failed && order.error && (
                            <span className="text-red-400/70 normal-case max-w-[240px] truncate" title={order.error}>
                                {order.error}
                            </span>
                        )}

                        {failed && (
                            <button
                                onClick={() => removePendingOrder(order.localId)}
                                className="ml-1 text-red-400/70 hover:text-red-200"
                                aria-label="Dismiss"
                            >
                                ×
                            </button>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
