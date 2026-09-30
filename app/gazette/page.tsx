// app/gazette/page.tsx
// Stars of Dominion — the public gazette (casual-play spec Item 6d).
//
// Open to anyone with the link: no session is read here and none is needed.
// It shows the last week of what the narrator has published and the season's
// name — see lib/gazette/public-gazette.ts for the rule on what may be shown.

import type { Metadata } from 'next';
import PublicGazette from '@/components/gazette/PublicGazette';
import { loadPublicArticles, loadPublicWorldFacts } from '@/lib/gazette/gazette-service';
import { seasonLabel } from '@/lib/gazette/public-gazette';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
    const [facts, articles] = await Promise.all([loadPublicWorldFacts(), loadPublicArticles()]);
    return {
        title: `The Galactic Gazette · ${seasonLabel(facts.season)}`,
        description: articles[0]?.headline ?? 'News from a galaxy run by its players.',
    };
}

export default async function GazettePage() {
    const [facts, articles] = await Promise.all([loadPublicWorldFacts(), loadPublicArticles()]);
    return <PublicGazette season={facts.season} factionNames={facts.factionNames} articles={articles} />;
}
