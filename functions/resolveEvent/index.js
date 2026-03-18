// functions/resolveEvent/index.js
import { Client, Databases, ID } from 'appwrite';

export default async ({ req, res, log, error }) => {
  try{
    const body = JSON.parse(req.body || '{}');
    const { eventId, choiceId } = body;
    const client = new Client()
      .setEndpoint(process.env.APPWRITE_FUNCTION_ENDPOINT)
      .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
      .setKey(process.env.APPWRITE_API_KEY);
    const db = new Databases(client);
    const DB_ID = 'game';
    const COLL_GAZ = 'gazettes';
    const COLL_STATE = 'world_state';
    const st = (await db.listDocuments(DB_ID, COLL_STATE)).documents[0];

    await db.createDocument(DB_ID, COLL_GAZ, ID.unique(), {
      day: st.day,
      headline: 'Choice taken',
      lede: `Event ${eventId} -> ${choiceId}`,
      tone: 'neutral'
    });

    return res.json({ ok:true });
  }catch(e){ error(e); return res.json({ ok:false, error: String(e) }, 500); }
}
