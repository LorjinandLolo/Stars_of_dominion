import { Client, Databases, Query, ID } from 'node-appwrite';

export default async ({ req, res, log, error }) => {
    const client = new Client()
        .setEndpoint(process.env.APPWRITE_FUNCTION_ENDPOINT)
        .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
        .setKey(process.env.APPWRITE_API_KEY);

    const db = new Databases(client);
    const DB_ID = 'game';
    const COLL_EVENTS = 'events';
    const COLL_FACTIONS = 'factions';
    const COLL_GAZ = 'gazettes';

    try {
        // 1. Gather Context
        const factions = await db.listDocuments(DB_ID, COLL_FACTIONS);
        const recentNews = await db.listDocuments(DB_ID, COLL_GAZ, [
            Query.limit(5),
            Query.orderDesc('day')
        ]);

        const context = {
            factions: factions.documents.map(f => ({ name: f.name, alignment: f.alignment })),
            news: recentNews.documents.map(n => n.headline)
        };

        // 2. Call LLM (Gemini)
        const prompt = `
      You are the AI Game Master for a sci-fi strategy game.
      Current Factions: ${JSON.stringify(context.factions)}
      Recent News: ${JSON.stringify(context.news)}
      
      Generate a new "Game Event" that forces a faction to make a difficult choice.
      Return JSON format:
      {
        "title": "Event Title",
        "body": "Description of the situation...",
        "choices": [
          { "id": "a", "text": "Option A", "effects": [] },
          { "id": "b", "text": "Option B", "effects": [] }
        ]
      }
    `;

        const apiKey = process.env.GOOGLE_API_KEY;
        if (!apiKey) throw new Error('GOOGLE_API_KEY not set');

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!text) throw new Error('No response from LLM');

        // Clean up markdown code blocks if present
        const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
        const eventData = JSON.parse(jsonStr);

        // 3. Create Event in DB
        await db.createDocument(DB_ID, COLL_EVENTS, ID.unique(), {
            title: eventData.title,
            body: eventData.body,
            choices: JSON.stringify(eventData.choices),
            triggers: JSON.stringify([]), // Default
            effects: JSON.stringify([])   // Default
        });

        return res.json({ ok: true, event: eventData });

    } catch (e) {
        error(e);
        return res.json({ ok: false, error: String(e) }, 500);
    }
};
