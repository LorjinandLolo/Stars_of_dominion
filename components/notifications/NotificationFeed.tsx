'use client';
// components/notifications/NotificationFeed.tsx
// Stars of Dominion — Slide-in notification feed panel

import React from 'react';
import { X, Check, CheckCheck, Trash2 } from 'lucide-react';
import { useNotificationStore, PRIORITY_COLORS, CATEGORY_ICONS } from '@/lib/notifications/notification-store';
import { useUIStore } from '@/lib/store/ui-store';
import type { NavTab } from '@/types/ui-state';

export default function NotificationFeed() {
    const { notifications, feedOpen, setFeedOpen, markRead, markAllRead, dismiss, clearAll } =
        useNotificationStore();
    const setActiveTab = useUIStore(s => s.setActiveTab);

    if (!feedOpen) return null;

    const handleNotificationClick = (n: typeof notifications[0]) => {
        markRead(n.id);
        if (n.linkToTab) setActiveTab(n.linkToTab as NavTab);
        setFeedOpen(false);
    };

    const grouped = notifications.reduce<Record<string, typeof notifications>>((acc, n) => {
        const date = new Date(n.createdAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        if (!acc[date]) acc[date] = [];
        acc[date].push(n);
        return acc;
    }, {});

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px]"
                onClick={() => setFeedOpen(false)}
            />

            {/* Feed Panel */}
            <div className="fixed top-14 right-4 z-50 w-96 max-h-[80vh] flex flex-col rounded-2xl border border-white/10 bg-slate-950/95 backdrop-blur-2xl shadow-2xl shadow-black/50 animate-in slide-in-from-top-4 fade-in duration-300">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
                    <div>
                        <h3 className="text-sm font-display uppercase tracking-widest text-white">Transmissions</h3>
                        <p className="text-[10px] text-slate-500 mt-0.5">Intelligence Feed</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={markAllRead}
                            title="Mark all read"
                            className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                        >
                            <CheckCheck className="w-3.5 h-3.5" />
                        </button>
                        <button
                            onClick={clearAll}
                            title="Clear all"
                            className="p-1.5 rounded-lg hover:bg-red-950/40 text-slate-400 hover:text-red-400 transition-colors"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                            onClick={() => setFeedOpen(false)}
                            className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>

                {/* Notification List */}
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {notifications.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-center">
                            <div className="text-3xl mb-3 opacity-30">📡</div>
                            <p className="text-[10px] font-mono text-slate-600 uppercase tracking-widest">No transmissions received</p>
                        </div>
                    ) : (
                        Object.entries(grouped).map(([date, items]) => (
                            <div key={date}>
                                <div className="px-5 py-2 bg-white/5 border-y border-white/5">
                                    <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest">{date}</span>
                                </div>
                                {items.map((n) => (
                                    <button
                                        key={n.id}
                                        onClick={() => handleNotificationClick(n)}
                                        className={`w-full text-left px-5 py-4 border-b border-white/5 transition-colors hover:bg-white/5 relative ${
                                            !n.read ? 'bg-white/[0.02]' : ''
                                        }`}
                                    >
                                        {/* Unread indicator */}
                                        {!n.read && (
                                            <div className="absolute left-2 top-1/2 -translate-y-1/2 w-1 h-1 rounded-full bg-blue-400" />
                                        )}

                                        <div className="flex items-start gap-3">
                                            <div className={`flex-shrink-0 w-8 h-8 rounded-lg border flex items-center justify-center text-sm ${PRIORITY_COLORS[n.priority]}`}>
                                                {CATEGORY_ICONS[n.category] ?? '📌'}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className={`text-[11px] font-display uppercase tracking-wide truncate ${n.read ? 'text-slate-400' : 'text-white'}`}>
                                                        {n.title}
                                                    </span>
                                                    <span className="text-[9px] text-slate-600 flex-shrink-0">
                                                        {new Date(n.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                </div>
                                                <p className="text-[10px] text-slate-500 mt-0.5 line-clamp-2 leading-relaxed">
                                                    {n.body}
                                                </p>
                                            </div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        ))
                    )}
                </div>
            </div>
        </>
    );
}
