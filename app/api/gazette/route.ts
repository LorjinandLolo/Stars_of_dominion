import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { withDocAliases } from '@/lib/db';

export async function GET(req: NextRequest){
  const { searchParams } = new URL(req.url);
  const day = parseInt(searchParams.get('day') || '1', 10);
  const window = parseInt(process.env.GAZETTE_WINDOW_DAYS || '2', 10);
  const start = day - window + 1;
  const articles = await prisma.gazette.findMany({
    where: { day: { gte: start, lte: day } },
    take: 50,
  });
  return new Response(JSON.stringify({ day, window, articles: articles.map(withDocAliases) }), { headers: { 'Content-Type':'application/json' } });
}
