"use client";

// components/panels/diplomacy/ContactEmblem.tsx
// An empire's tile: its colour and initials. There is no flag art yet, so the
// emblem is the colour the galaxy map already paints that empire's stars in,
// which is the association players have formed.

import React from 'react';
import type { Contact } from './contact-model';

export default function ContactEmblem({
    contact, size = 40, active = false, className = '',
}: { contact: Contact; size?: number; active?: boolean; className?: string }) {
    const { color, initials } = contact;
    const fontSize = Math.max(9, Math.round(size * 0.34));
    return (
        <div
            aria-hidden
            className={`relative shrink-0 rounded-lg flex items-center justify-center font-display font-bold tracking-wider select-none transition-all duration-300 ${className}`}
            style={{
                width: size,
                height: size,
                fontSize,
                color,
                background: `linear-gradient(145deg, ${color}33, ${color}0d)`,
                border: `1px solid ${active ? color : `${color}66`}`,
                boxShadow: active ? `0 0 14px ${color}66, inset 0 0 10px ${color}22` : `inset 0 0 8px ${color}14`,
                textShadow: `0 0 8px ${color}99`,
            }}
        >
            {initials}
        </div>
    );
}
