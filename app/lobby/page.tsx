// app/lobby/page.tsx
// Faction-select lobby — shown before entering the game.

import LobbyScreen from '@/components/LobbyScreen';
import { LOBBY_FACTIONS } from '@/data/factions/lobby-factions';

export default function LobbyPage() {
    return <LobbyScreen factions={[...LOBBY_FACTIONS]} />;
}
