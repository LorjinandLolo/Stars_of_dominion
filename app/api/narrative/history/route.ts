// The archive behind the front page: every article the narrator has written,
// newest first. The gazette shows a day; this shows the galaxy's memory.

import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';

const KINDS = ['news', 'investigation', 'obituary', 'retrospective', 'propaganda', 'rumor'];

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const kind = searchParams.get('kind');
    const limit = Math.min(parseInt(searchParams.get('limit') || '40', 10) || 40, 100);

    const where = kind && KINDS.includes(kind) ? { kind } : {};

    const [articles, counts] = await Promise.all([
        prisma.narrativeArticle.findMany({
            where,
            orderBy: [{ day: 'desc' }, { createdAt: 'desc' }],
            take: limit,
            select: { id: true, kind: true, headline: true, body: true, day: true, publisherId: true, stance: true },
        }),
        prisma.narrativeArticle.groupBy({ by: ['kind'], _count: { kind: true } }),
    ]);

    // The masthead and era name are already recorded on each article; surfacing
    // them here saves the client from parsing stance itself.
    const shaped = articles.map(a => {
        let masthead: string | null = null;
        let eraName: string | null = null;
        try {
            const stance = a.stance ? JSON.parse(a.stance) : {};
            masthead = stance.masthead ?? null;
            eraName = stance.eraName ?? null;
        } catch { /* an unparseable stance is not worth failing a page load over */ }
        return {
            id: a.id,
            kind: a.kind,
            headline: a.headline,
            body: a.body,
            day: a.day,
            publisherId: a.publisherId,
            masthead,
            eraName,
        };
    });

    return new Response(
        JSON.stringify({
            articles: shaped,
            counts: Object.fromEntries(counts.map(c => [c.kind, c._count.kind])),
        }),
        { headers: { 'Content-Type': 'application/json' } },
    );
}
