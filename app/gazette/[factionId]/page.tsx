// app/gazette/[factionId]/page.tsx
// Stars of Dominion — one empire's headlines in the public gazette (Item 6d).
//
// Open, like /gazette. An empire's page lists the stories the PRESS connects
// with it — its name as a target, or as an actor the galaxy knows about — not
// the stories the chronicle knows it was behind (lib/gazette/public-gazette.ts).
// An id the galaxy has no name for is a 404, not an empty page.

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import PublicGazette from '@/components/gazette/PublicGazette';
import { loadPublicArticles, loadPublicWorldFacts } from '@/lib/gazette/gazette-service';
import { articlesAbout, seasonLabel } from '@/lib/gazette/public-gazette';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ factionId: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
    const { factionId } = await params;
    const id = decodeURIComponent(factionId);
    const [facts, articles] = await Promise.all([loadPublicWorldFacts(), loadPublicArticles()]);
    const name = facts.factionNames[id];
    if (!name) return { title: 'The Galactic Gazette' };
    return {
        title: `${name} · The Galactic Gazette`,
        description: articlesAbout(articles, id)[0]?.headline ?? `${name} in ${seasonLabel(facts.season)}.`,
    };
}

export default async function EmpireGazettePage({ params }: Params) {
    const { factionId } = await params;
    const id = decodeURIComponent(factionId);
    const [facts, articles] = await Promise.all([loadPublicWorldFacts(), loadPublicArticles()]);
    if (!facts.factionNames[id]) notFound();
    return <PublicGazette season={facts.season} factionNames={facts.factionNames} articles={articles} factionId={id} />;
}
