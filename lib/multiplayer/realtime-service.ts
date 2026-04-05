// lib/multiplayer/realtime-service.ts
// Stars of Dominion — Appwrite Realtime Subscription Service
// Subscribes to Appwrite Realtime for live game state updates.
// Call once on app mount; cleans up on unmount.

import { Client, RealtimeResponseEvent } from 'appwrite';
import type { GameNotification } from '@/lib/time/time-types';
import type { DiplomaticOffer } from '@/lib/diplomacy/diplomacy-types';

// Appwrite channel constants
const CHANNEL_WORLD_STATE   = 'databases.game.collections.world_state.documents';
const CHANNEL_CRISES        = 'databases.game.collections.crises.documents';
const CHANNEL_DIPLOMACY     = 'databases.game.collections.diplomatic_offers.documents';
const CHANNEL_NOTIFICATIONS = 'databases.game.collections.notifications.documents';
const CHANNEL_PRESENCE      = 'databases.game.collections.presence.documents';

export type RealtimeCallbacks = {
    onTickComplete?: (data: { tickIndex: number; nextTickAt: string }) => void;
    onCrisisUpdate?: (crisis: any) => void;
    onDiplomacyUpdate?: (offer: DiplomaticOffer) => void;
    onNotification?: (notification: GameNotification) => void;
    onPresenceUpdate?: (presence: { factionId: string; isOnline: boolean; lastSeenAt: string }) => void;
};

/**
 * Subscribe to Appwrite Realtime channels.
 * Returns an unsubscribe function — call on component unmount.
 */
export function subscribeToGameUpdates(callbacks: RealtimeCallbacks): () => void {
    const client = new Client()
        .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT ?? '')
        .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT || process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || '');

    const handler = (response: RealtimeResponseEvent<any>) => {
        const channel = response.channels[0] ?? '';
        const payload = response.payload;

        if (channel.includes('world_state')) {
            callbacks.onTickComplete?.({
                tickIndex: payload?.tick_index ?? 0,
                nextTickAt: payload?.next_tick_at ?? '',
            });
        }
        if (channel.includes('crises')) {
            callbacks.onCrisisUpdate?.(payload);
        }
        if (channel.includes('diplomatic_offers')) {
            callbacks.onDiplomacyUpdate?.(payload as DiplomaticOffer);
        }
        if (channel.includes('notifications')) {
            callbacks.onNotification?.(payload as GameNotification);
        }
        if (channel.includes('presence')) {
            callbacks.onPresenceUpdate?.(payload);
        }
    };

    const unsubscribe = client.subscribe(
        [
            CHANNEL_WORLD_STATE,
            CHANNEL_CRISES,
            CHANNEL_DIPLOMACY,
            CHANNEL_NOTIFICATIONS,
            CHANNEL_PRESENCE,
        ],
        handler
    );

    return unsubscribe;
}
