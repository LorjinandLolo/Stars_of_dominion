'use client';
// components/notifications/NotificationBell.tsx
// Stars of Dominion — Notification Bell Icon with Badge + Urgent Pulse

import React, { useEffect } from 'react';
import { isPageVisible, onPageVisibilityChange } from '@/hooks/usePageVisible';
import { Bell } from 'lucide-react';
import { useNotificationStore } from '@/lib/notifications/notification-store';

const POLL_INTERVAL_MS = 30_000; // 30s
// Hidden, the bell is the one thing still worth asking about (the tab title
// carries the unread count), but at a fifth of the rate.
const HIDDEN_POLL_EVERY = 5;

export default function NotificationBell({ factionId }: { factionId?: string }) {
    const { unreadCount, addNotifications, toggleFeed, feedOpen } = useNotificationStore();
    const hasUrgent = useNotificationStore(s =>
        s.notifications.some(n => !n.read && n.priority === 'urgent')
    );

    // Poll /api/notifications every 30s
    useEffect(() => {
        if (!factionId) return;

        let skipped = 0;
        const poll = async () => {
            if (!isPageVisible() && ++skipped < HIDDEN_POLL_EVERY) return;
            skipped = 0;
            try {
                // The server takes the faction from the session, never from the URL.
                const res = await fetch('/api/notifications', { signal: AbortSignal.timeout(15_000) });
                if (!res.ok) return;
                const data = await res.json();
                if (Array.isArray(data.notifications) && data.notifications.length > 0) {
                    addNotifications(data.notifications);
                }
            } catch {
                // silently ignore network errors
            }
        };

        poll();
        const id = setInterval(poll, POLL_INTERVAL_MS);
        const stopWatching = onPageVisibilityChange((visible) => { if (visible) { skipped = 0; void poll(); } });
        return () => { clearInterval(id); stopWatching(); };
    }, [factionId, addNotifications]);

    // A background tab says so in its title: "(3) Stars of Dominion".
    useEffect(() => {
        if (typeof document === 'undefined') return;
        const base = document.title.replace(/^\(\d+\+?\)\s*/, '');
        document.title = unreadCount > 0 ? `(${unreadCount > 99 ? '99+' : unreadCount}) ${base}` : base;
    }, [unreadCount]);

    return (
        <button
            onClick={toggleFeed}
            id="notification-bell"
            title="Notifications"
            className={`relative flex items-center justify-center w-9 h-9 rounded-xl border transition-all duration-300 ${
                feedOpen
                    ? 'bg-blue-500/20 border-blue-500/40 text-blue-400'
                    : 'bg-white/5 border-white/10 hover:border-white/30 text-slate-400 hover:text-white'
            }`}
        >
            <Bell className={`w-4 h-4 ${hasUrgent ? 'text-red-400' : ''}`} />

            {/* Urgent pulse ring */}
            {hasUrgent && (
                <span className="absolute inset-0 rounded-xl border border-red-500/60 animate-ping opacity-50 pointer-events-none" />
            )}

            {/* Unread badge */}
            {unreadCount > 0 && (
                <span className={`
                    absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1
                    flex items-center justify-center
                    rounded-full text-[9px] font-bold font-mono
                    ${hasUrgent ? 'bg-red-500 text-white' : 'bg-blue-500 text-white'}
                    transition-all
                `}>
                    {unreadCount > 99 ? '99+' : unreadCount}
                </span>
            )}
        </button>
    );
}
