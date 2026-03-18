// lib/appwrite-browser.ts (browser client for realtime & reads that don't need a key)
import { Client, Databases } from 'appwrite';

let client: Client | null = null;
let db: Databases | null = null;

export function getBrowserClients() {
  if (!client) {
    client = new Client()
      .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!)
      .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT!);
    db = new Databases(client);
  }
  return { client: client!, db: db! };
}
