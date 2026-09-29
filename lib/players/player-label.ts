// lib/players/player-label.ts
// Stars of Dominion — who is actually behind an empire (casual-play Item 6b).
//
// The galaxy mixes friends and AI. Knowing which rival is a person changes how
// you read an offer, a gambit, a war. The sync route sends, for every claimed
// empire, the display name its player chose in the lobby — already public
// there — and everything that names an empire can append this label.
//
// Pure, no imports: the client, the brief projection and probes share it.

/** factionId → the claimant's lobby display name. Absent = AI-run. */
export type HumanPlayers = Readonly<Record<string, string>>;

/** "played by Lorjin", or "AI" for an empire nobody claimed. */
export function playedByLabel(factionId: string, players: HumanPlayers | null | undefined): string {
    const name = players?.[factionId];
    return name ? `played by ${name}` : 'AI';
}

/** "Aurelian Hegemony · played by Lorjin" / "Kaer’Ruun · AI". */
export function empireWithPlayer(empireName: string, factionId: string, players: HumanPlayers | null | undefined): string {
    return `${empireName} · ${playedByLabel(factionId, players)}`;
}

/** Is a person playing this empire? */
export function isHumanEmpire(factionId: string, players: HumanPlayers | null | undefined): boolean {
    return !!players?.[factionId];
}
