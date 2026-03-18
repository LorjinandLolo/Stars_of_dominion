import { NextRequest } from 'next/server';
import { getServerClients } from '@/lib/appwrite';

const DB_ID = 'game';
const COLL_GAZ = 'gazettes';

export async function GET(req: NextRequest){
  const { db, Query } = await getServerClients();
  const { searchParams } = new URL(req.url);
  const day = parseInt(searchParams.get('day') || '1', 10);
  const window = parseInt(process.env.GAZETTE_WINDOW_DAYS || '2', 10);
  const start = day - window + 1;
  const res = await db.listDocuments(DB_ID, COLL_GAZ, [
    Query.greaterThanEqual('day', start),
    Query.lessThanEqual('day', day),
    Query.limit(50)
  ]);
  return new Response(JSON.stringify({ day, window, articles: res.documents }), { headers: { 'Content-Type':'application/json' } });
}
