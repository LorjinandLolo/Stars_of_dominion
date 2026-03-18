// functions/advanceDay/index.js
import { Client, Databases, Query, ID } from 'appwrite';

export default async ({ req, res, log, error }) => {
  try{
    const client = new Client()
      .setEndpoint(process.env.APPWRITE_FUNCTION_ENDPOINT)
      .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
      .setKey(process.env.APPWRITE_API_KEY);
    const db = new Databases(client);
    const DB_ID = 'game';
    const COLL_STATE = 'world_state';
    const COLL_GAZ = 'gazettes';

    const stList = await db.listDocuments(DB_ID, COLL_STATE, [Query.limit(1)]);
    const st = stList.documents[0];
    const newDay = st.day + 1;
    await db.updateDocument(DB_ID, COLL_STATE, st.$id, { day: newDay });

    // (Optional) compile gazette here from events resolved since last edition

    return res.json({ ok:true, day:newDay });
  }catch(e){ error(e); return res.json({ ok:false, error: String(e) }, 500); }
}
