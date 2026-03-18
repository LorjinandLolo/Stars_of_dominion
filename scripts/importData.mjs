import path from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import fs from 'node:fs/promises'; // Keep this for readFile later
import { Client, Databases, ID } from 'node-appwrite';

const envPath = path.resolve(process.cwd(), '.env.local');
// Removed broken block

const env = {};
if (existsSync(envPath)) {
  const content = readFileSync(envPath, 'utf-8');
  content.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      env[key] = value;
    }
  });
}

const client = new Client()
  .setEndpoint(env.NEXT_PUBLIC_APPWRITE_ENDPOINT || process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT)
  .setProject(env.NEXT_PUBLIC_APPWRITE_PROJECT || process.env.NEXT_PUBLIC_APPWRITE_PROJECT)
  .setKey(env.APPWRITE_API_KEY || process.env.APPWRITE_API_KEY);

const db = new Databases(client);
const DB_ID = env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || 'game';
const COLL_EVENTS = 'events';

const file = process.argv[2] || 'data/events.json';

async function main() {
  const raw = await fs.readFile(file, 'utf-8');
  const data = JSON.parse(raw);
  const events = data.events || data || [];
  for (const ev of events) {
    await db.createDocument(DB_ID, COLL_EVENTS, ID.unique(), ev);
    console.log('Imported', ev.id || ev.title);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
