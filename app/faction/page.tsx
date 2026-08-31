import { redirect } from 'next/navigation';

// The legacy "Faction Hub" (list + CreateFactionForm) predates the lobby and
// queued FACTION_JOIN orders as issuer 'system' — which the order queue now
// rejects outright. Factions are claimed in the lobby on the root page; this
// route only redirects so old bookmarks land somewhere real.
export default function FactionHub() {
    redirect('/');
}
