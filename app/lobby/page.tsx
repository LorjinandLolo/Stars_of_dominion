// app/lobby/page.tsx
// Faction-select lobby — shown before entering the game.

import LobbyScreen from '@/components/LobbyScreen';

// Static faction definitions (used until Appwrite factions are seeded)
const LOBBY_FACTIONS = [
    {
        id: 'faction-aurelian',
        name: 'Aurelian Combine',
        tagline: 'Order through dominion.',
        description: 'A bureaucratic empire of institutional power and trade infrastructure. Masters of the Council and regional blocs.',
        color: '#1e3a8a',
        accentColor: '#60a5fa',
        icon: '🏛️',
        playstyle: 'Diplomatic / Economic',
        traits: ['Trade Supremacy', 'Council Bloc', 'Institutional Grip'],
    },
    {
        id: 'faction-vektori',
        name: 'Vektori Ascendancy',
        tagline: 'Steel wins where words fail.',
        description: 'A martial culture built around military supremacy. They dominate through force, discipline, and relentless expansion.',
        color: '#7f1d1d',
        accentColor: '#f87171',
        icon: '⚔️',
        playstyle: 'Military / Expansion',
        traits: ['War Machine', 'Rapid Mobilisation', 'Siege Masters'],
    },
    {
        id: 'faction-null-syndicate',
        name: 'Null Syndicate',
        tagline: 'Unseen. Untouchable. Indispensable.',
        description: 'The shadow empire of the Nullward Fringe. They control the black markets, corsair dens, and trade rings invisible to Council scrutiny.',
        color: '#1c1917',
        accentColor: '#a78bfa',
        icon: '🕷️',
        playstyle: 'Espionage / Black Market',
        traits: ['Shadow Economy', 'Corsair Network', 'Information Broker'],
    },
    {
        id: 'faction-covenant',
        name: 'Covenant of Convergence',
        tagline: 'The future is written in fire and faith.',
        description: 'A theocratic technocracy that blends psionics, forbidden science, and zealous expansion. Their research yields weapons others cant imagine.',
        color: '#1a2e1a',
        accentColor: '#4ade80',
        icon: '🔮',
        playstyle: 'Research / Psionic',
        traits: ['Psionic Arsenal', 'Forbidden Science', 'Cultural Conversion'],
    },
];

export default function LobbyPage() {
    return <LobbyScreen factions={LOBBY_FACTIONS} />;
}
