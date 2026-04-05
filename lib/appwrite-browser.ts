// lib/appwrite-browser.ts (browser client for realtime & reads that don't need a key)
import { Client, Databases } from 'appwrite';

let client: Client | null = null;
let db: Databases | null = null;

export function getBrowserClients() {
  if (!client) {
    const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT;
    const project = process.env.NEXT_PUBLIC_APPWRITE_PROJECT;

    client = new Client();
    if (endpoint) client.setEndpoint(endpoint);
    if (project) client.setProject(project);

    db = new Databases(client);
  }
  return { client: client!, db: db! };
}
