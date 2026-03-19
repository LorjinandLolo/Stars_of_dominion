'use client';
// lib/notifications/notification-store.ts
// Stars of Dominion — Client-Side Notification Zustand Store
// Polls /api/notifications and manages the local unread queue.

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { GameNotification, NotificationCategory, NotificationPriority } from '@/lib/time/time-types';

export type { GameNotification };

export interface NotificationStore {
    notifications: GameNotification[];
    unreadCount: number;

    // Actions
    addNotification: (n: GameNotification) => void;
    addNotifications: (ns: GameNotification[]) => void;
    markRead: (id: string) => void;
    markAllRead: () => void;
    dismiss: (id: string) => void;
    clearAll: () => void;

    // UI state
    feedOpen: boolean;
    setFeedOpen: (open: boolean) => void;
    toggleFeed: () => void;
}

export const useNotificationStore = create<NotificationStore>()(
    persist(
        (set, get) => ({
            notifications: [],
            unreadCount: 0,
            feedOpen: false,

            addNotification: (n) =>
                set((state) => {
                    // Prevent duplicates
                    if (state.notifications.some(x => x.id === n.id)) return state;
                    const updated = [n, ...state.notifications].slice(0, 200); // cap at 200
                    return {
                        notifications: updated,
                        unreadCount: updated.filter(x => !x.read).length,
                    };
                }),

            addNotifications: (ns) =>
                set((state) => {
                    const existingIds = new Set(state.notifications.map(x => x.id));
                    const newOnes = ns.filter(n => !existingIds.has(n.id));
                    if (!newOnes.length) return state;
                    const updated = [...newOnes, ...state.notifications].slice(0, 200);
                    return {
                        notifications: updated,
                        unreadCount: updated.filter(x => !x.read).length,
                    };
                }),

            markRead: (id) =>
                set((state) => {
                    const updated = state.notifications.map(n => n.id === id ? { ...n, read: true } : n);
                    return { notifications: updated, unreadCount: updated.filter(x => !x.read).length };
                }),

            markAllRead: () =>
                set((state) => ({
                    notifications: state.notifications.map(n => ({ ...n, read: true })),
                    unreadCount: 0,
                })),

            dismiss: (id) =>
                set((state) => {
                    const updated = state.notifications.filter(n => n.id !== id);
                    return { notifications: updated, unreadCount: updated.filter(x => !x.read).length };
                }),

            clearAll: () => set({ notifications: [], unreadCount: 0 }),

            setFeedOpen: (open) => set({ feedOpen: open }),
            toggleFeed: () => set((state) => ({ feedOpen: !state.feedOpen })),
        }),
        {
            name: 'stars-of-dominion-notifications',
            // Only persist the read/unread list, not the feed open state
            partialize: (state) => ({
                notifications: state.notifications.slice(0, 50), // only persist recent 50
            }),
        }
    )
);

// ─── Priority helpers ─────────────────────────────────────────────────────────

export const PRIORITY_COLORS: Record<NotificationPriority, string> = {
    urgent: 'text-red-400 border-red-500/40 bg-red-950/30',
    normal: 'text-blue-300 border-blue-500/20 bg-blue-950/20',
    low:    'text-slate-400 border-white/10 bg-white/5',
};

export const CATEGORY_ICONS: Record<NotificationCategory, string> = {
    crisis:       '⚠',
    diplomacy:    '🤝',
    construction: '🔨',
    research:     '🔬',
    combat:       '⚔',
    espionage:    '🕵',
    trade:        '📦',
    politics:     '🏛',
    system:       '⚙',
};
